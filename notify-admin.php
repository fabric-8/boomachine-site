<?php
/* Boo Machine: the launch list's admin endpoint (README-NOTIFY.md).
   Every request needs  Authorization: Bearer <admin_token>  from
   notify-config.php (written by the deploy from the NOTIFY_ADMIN_TOKEN
   secret, never in git). No token configured, or shorter than 32
   characters: 503 for everything. Wrong or missing token: 401.

     GET  ?action=counts                 numbers only, no addresses
     GET  ?action=export                 CSV of the confirmed addresses
     GET  ?action=campaigns              campaign progress
     POST {"action":"delete","email":"...","purge":false}
                                         erasure: the entry goes; a tombstone
                                         stays unless purge is true
     POST {"action":"campaign","id":"launch","subject":"...","text":"...","html":"..."}
                                         creates a campaign, or confirms that an
                                         identical one exists (resume); a changed
                                         text for an id that has sent is refused
     POST {"action":"test","id":"launch","to":"you@..."}
                                         one preview mail, not recorded
     POST {"action":"send","id":"launch","budget":20,"interval":1,"dry_run":false}
                                         sends for up to budget seconds, one mail
                                         per interval seconds; call again until
                                         "done" (scripts/notify-send.php does)
     POST {"action":"retry_failed","id":"launch"}
                                         failed addresses are tried again */
declare(strict_types=1);

require __DIR__ . '/notify-lib.php';

header('Cache-Control: no-store');
header('X-Robots-Tag: noindex');

function out(int $code, array $body): never {
  http_response_code($code);
  header('Content-Type: application/json; charset=utf-8');
  echo json_encode($body, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE), "\n";
  exit;
}

$method = $_SERVER['REQUEST_METHOD'] ?? '';
if ($method !== 'GET' && $method !== 'POST') { header('Allow: GET, POST'); out(405, ['error' => 'GET or POST']); }

$token = (string)(notify_config()['admin_token'] ?? '');
if (!preg_match('/^[A-Za-z0-9]{32,256}$/', $token)) out(503, ['error' => 'notify admin is not configured']);
$auth = (string)($_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '');
if ($auth === '' && function_exists('getallheaders')) {
  foreach (getallheaders() as $k => $v) if (strcasecmp($k, 'Authorization') === 0) $auth = (string)$v;
}
$given = preg_match('/^Bearer\s+(\S+)$/i', trim($auth), $m) ? $m[1] : '';
if ($given === '' || !hash_equals($token, $given)) {
  usleep(300000);
  header('WWW-Authenticate: Bearer');
  out(401, ['error' => 'unauthorized']);
}

$in = [];
if ($method === 'POST') {
  $raw = file_get_contents('php://input', false, null, 0, 400001);
  if (!is_string($raw) || strlen($raw) > 400000) out(413, ['error' => 'too large']);
  $in = json_decode($raw, true, 4);
  if (!is_array($in)) out(400, ['error' => 'JSON body expected']);
  $action = (string)($in['action'] ?? '');
} else {
  $action = (string)($_GET['action'] ?? 'counts');
}

try {
  switch ("$method $action") {

    case 'GET counts':
      $now = time();
      $c = notify_list(function (array &$l) use ($now) {
        $o = ['pending' => 0, 'confirmed' => 0, 'unsubscribed' => 0, 'expired_waiting_for_purge' => 0, 'confirmed_by_src' => [], 'confirmed_last_7_days' => 0, 'mails_last_hour' => 0];
        foreach ($l['subs'] as $e) {
          $s = (string)($e['status'] ?? '');
          if (notify_expired($e, $now)) { $o['expired_waiting_for_purge']++; continue; }
          if (isset($o[$s]) && is_int($o[$s])) $o[$s]++;
          if ($s === 'confirmed') {
            $src = (string)($e['src'] ?? 'other'); $o['confirmed_by_src'][$src] = ($o['confirmed_by_src'][$src] ?? 0) + 1;
            if ((int)$e['confirmed_at'] > $now - 7 * 86400) $o['confirmed_last_7_days']++;
          }
        }
        $o['mails_last_hour'] = count(array_filter($l['mails'], fn($t) => $t > $now - 3600));
        return $o;
      });
      out(200, $c + ['consent_version' => CONSENT_VERSION, 'mailer' => notify_dev() ? 'dev outbox' : ((notify_config()['smtp_host'] ?? '') !== '' ? 'smtp' : 'mail()')]);

    case 'GET export':
      $rows = notify_list(function (array &$l) {
        $r = [];
        foreach ($l['subs'] as $e) if (($e['status'] ?? '') === 'confirmed') $r[] = $e;
        usort($r, fn($a, $b) => $a['confirmed_at'] <=> $b['confirmed_at']);
        return $r;
      });
      header('Content-Type: text/csv; charset=utf-8');
      header('Content-Disposition: attachment; filename="boomachine-list-' . date('Y-m-d') . '.csv"');
      $fh = fopen('php://output', 'w');
      fputcsv($fh, ['email', 'confirmed_at', 'created', 'src', 'consent_version'], ',', '"', '');
      foreach ($rows as $e) fputcsv($fh, [$e['email'], date('c', (int)$e['confirmed_at']), date('c', (int)$e['created']), $e['src'] ?? '', $e['consent_v'] ?? ''], ',', '"', '');
      exit;

    case 'GET campaigns':
      $o = [];
      foreach (glob(notify_dir('campaigns') . '/*.json') ?: [] as $f) {
        $c = json_decode((string)file_get_contents($f), true);
        if (!is_array($c)) continue;
        $done = array_count_values(array_values($c['done'] ?? []));
        $o[] = ['id' => $c['id'], 'subject' => $c['subject'], 'created' => date('c', $c['created']),
                'started' => isset($c['started']) ? date('c', $c['started']) : null, 'finished' => isset($c['finished']) ? date('c', $c['finished']) : null,
                'sent' => $done['sent'] ?? 0, 'failed' => $done['failed'] ?? 0];
      }
      out(200, ['campaigns' => $o]);

    case 'POST delete':
      $email = strtolower(trim((string)($in['email'] ?? '')));
      if (!filter_var($email, FILTER_VALIDATE_EMAIL)) out(400, ['error' => 'email']);
      $key = notify_key($email);
      $purge = ($in['purge'] ?? false) === true;
      $was = notify_list(function (array &$l) use ($key, $purge) {
        $e = $l['subs'][$key] ?? null;
        if ($e === null) return null;
        if ($purge) unset($l['subs'][$key]); else $l['subs'][$key] = notify_tombstone($e, time());
        return $e['status'] ?? '?';
      }, true);
      out(200, ['deleted' => $was !== null, 'was' => $was, 'tombstone' => $was !== null && !$purge]);

    case 'POST campaign':
      $id = $in['id'] ?? '';
      if (!notify_campaign_id_ok($id)) out(400, ['error' => 'id: 2-48 of a-z 0-9 -']);
      foreach (['subject', 'text', 'html'] as $f) if (!is_string($in[$f] ?? null) || trim($in[$f]) === '') out(400, ['error' => "$f missing"]);
      if (strlen($in['subject']) > 200 || preg_match('/[\r\n]/', $in['subject'])) out(400, ['error' => 'subject: one line, at most 200 bytes']);
      foreach (['text', 'html'] as $f) if (!str_contains($in[$f], '{{unsubscribe_url}}')) out(400, ['error' => "$f has no {{unsubscribe_url}}"]);
      $hash = hash('sha256', $in['subject'] . "\0" . $in['text'] . "\0" . $in['html']);
      $c = notify_campaign_load($id);
      if ($c) {
        if ($c['hash'] === $hash) out(200, ['campaign' => $id, 'created' => false, 'sent_so_far' => count(array_filter($c['done'] ?? [], fn($v) => $v === 'sent'))]);
        if (!empty($c['done'])) out(409, ['error' => 'a campaign with this id has already sent a different text; use a new id']);
      }
      notify_campaign_save(['id' => $id, 'subject' => $in['subject'], 'text' => $in['text'], 'html' => $in['html'], 'hash' => $hash, 'created' => time(), 'done' => []]);
      out(200, ['campaign' => $id, 'created' => true]);

    case 'POST test':
      $c = notify_campaign_id_ok($in['id'] ?? '') ? notify_campaign_load($in['id']) : null;
      if (!$c) out(404, ['error' => 'no such campaign']);
      $to = strtolower(trim((string)($in['to'] ?? '')));
      if (!filter_var($to, FILTER_VALIDATE_EMAIL)) out(400, ['error' => 'to']);
      $m = notify_campaign_message($c, $to, str_repeat('0', 32));
      $m['subject'] = notify_header_encode('[TEST] ' . $c['subject']);
      notify_deliver($m);
      out(200, ['test_sent_to' => $to, 'note' => 'the unsubscribe link in a test mail leads nowhere']);

    case 'POST send':
      if (!notify_campaign_id_ok($in['id'] ?? '')) out(400, ['error' => 'id']);
      $budget = max(1, min(50, (int)($in['budget'] ?? 20)));
      $interval = max(0.2, min(60.0, (float)($in['interval'] ?? 1)));
      ignore_user_abort(true);
      @set_time_limit($budget + 60);
      $r = notify_campaign_send($in['id'], $budget, $interval, ($in['dry_run'] ?? false) === true);
      out(isset($r['error']) && !isset($r['sent']) ? ($r['error'] === 'busy' ? 409 : 404) : 200, $r);

    case 'POST retry_failed':
      $c = notify_campaign_id_ok($in['id'] ?? '') ? notify_campaign_load($in['id']) : null;
      if (!$c) out(404, ['error' => 'no such campaign']);
      $lk = fopen(notify_dir('campaigns') . "/{$c['id']}.lock", 'c');
      if (!$lk || !flock($lk, LOCK_EX | LOCK_NB)) out(409, ['error' => 'busy']);
      $c = notify_campaign_load($c['id']);
      $n = 0;
      foreach ($c['done'] as $k => $v) if ($v === 'failed') { unset($c['done'][$k]); $n++; }
      unset($c['finished']);
      notify_campaign_save($c);
      out(200, ['cleared' => $n]);
  }
  out(400, ['error' => 'unknown action']);
} catch (Throwable $x) {
  notify_error_log("admin $action: " . $x->getMessage());
  out(500, ['error' => $x->getMessage()]);
}
