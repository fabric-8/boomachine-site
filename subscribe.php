<?php
/* Boo Machine: the launch list's sign-up (double opt-in; README-NOTIFY.md).

     POST /subscribe.php   {"email": "...", "consent": true, "hp": "", "src": "hero|bar|support"}

   200 {"ok":true,"status":"pending"}   a confirmation mail is on its way (or,
                                        for an address that is already waiting,
                                        was sent recently enough: at most
                                        ADDR_MAX_MAILS a day), or the honeypot
                                        was filled (nothing stored)
   200 {"ok":true,"status":"already"}   the address is confirmed already
   400 {"ok":false,"error":"invalid"}   bad address, no consent, bad request,
                                        not from the site itself
   429 {"ok":false,"error":"rate"}      too many attempts from this network, or
                                        the hourly flood brake is on
   500 {"ok":false,"error":"server"}    storage or mail failed
   405                                  not POST

   Nothing is stored before the address has passed every check; the IP
   address is never stored, only a keyed hash (notify-lib.php). */
declare(strict_types=1);

require __DIR__ . '/notify-lib.php';

const MAX_BYTES = 2048;
const BAD_DOMAINS = '/(^|\.)(example\.(com|net|org)|test|example|invalid|localhost|local|lan|internal)$/';

header('Cache-Control: no-store');
header('X-Robots-Tag: noindex');
header('Content-Type: application/json; charset=utf-8');

function reply(int $code, array $body): never {
  http_response_code($code);
  echo json_encode($body), "\n";
  exit;
}
function invalid(): never { reply(400, ['ok' => false, 'error' => 'invalid']); }

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') { header('Allow: POST'); reply(405, ['ok' => false, 'error' => 'invalid']); }
if ((int)($_SERVER['CONTENT_LENGTH'] ?? 0) > MAX_BYTES) invalid();

/* same origin only: the page's own form. Origin (or, failing that, Referer)
   must name boomachine.app; localhost only when the request itself is local. */
$src = (string)($_SERVER['HTTP_ORIGIN'] ?? '');
if ($src === '' || $src === 'null') $src = (string)($_SERVER['HTTP_REFERER'] ?? '');
$from = strtolower((string)parse_url($src, PHP_URL_HOST));
$self = strtolower(preg_replace('/:\d+$/', '', (string)($_SERVER['HTTP_HOST'] ?? '')) ?? '');
$ok = ['boomachine.app', 'www.boomachine.app'];
if (in_array($self, ['localhost', '127.0.0.1'], true)) array_push($ok, 'localhost', '127.0.0.1');
if ($from === '' || !in_array($from, $ok, true)) invalid();
$site = (string)($_SERVER['HTTP_SEC_FETCH_SITE'] ?? '');
if ($site !== '' && $site !== 'same-origin') invalid();

$raw = file_get_contents('php://input', false, null, 0, MAX_BYTES + 1);
if (!is_string($raw) || $raw === '' || strlen($raw) > MAX_BYTES) invalid();
$in = json_decode($raw, true, 3);
if (!is_array($in)) invalid();

/* the honeypot: a field people never see. Filled means a bot: pretend. */
$hp = $in['hp'] ?? '';
if (!is_string($hp) || trim($hp) !== '') reply(200, ['ok' => true, 'status' => 'pending']);

/* ---- the address and the consent ---------------------------------------- */
if (($in['consent'] ?? null) !== true) invalid();
$email = $in['email'] ?? null;
if (!is_string($email)) invalid();
$email = strtolower(trim($email));
if (strlen($email) > 254 || !filter_var($email, FILTER_VALIDATE_EMAIL)) invalid();
[$local, $domain] = explode('@', $email, 2) + [1 => ''];
if (strlen($local) > 64 || !preg_match('/^[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z][a-z0-9-]{1,62}$/', $domain) || preg_match(BAD_DOMAINS, $domain)) invalid();
$tag = $in['src'] ?? '';
$tag = is_string($tag) && in_array($tag, NOTIFY_SOURCES, true) ? $tag : 'other';

try {
  /* ---- per network: IP_MAX attempts in IP_WINDOW ------------------------ */
  $now = time();
  $rl = notify_dir('rl');
  $cf = @fopen("$rl/" . notify_ip_bucket(), 'c+');
  if (!$cf || !flock($cf, LOCK_EX)) throw new RuntimeException('rate file');
  $hits = array_values(array_filter(json_decode((string)stream_get_contents($cf), true) ?: [], fn($t) => is_int($t) && $t > $now - IP_WINDOW));
  $over = count($hits) >= IP_MAX;
  if (!$over) { $hits[] = $now; ftruncate($cf, 0); rewind($cf); fwrite($cf, json_encode($hits)); }
  flock($cf, LOCK_UN); fclose($cf);
  if ($over) reply(429, ['ok' => false, 'error' => 'rate']);
  foreach (glob("$rl/*") ?: [] as $f) {      /* counters past the window go */
    if (@filemtime($f) < $now - IP_WINDOW) @unlink($f);
  }

  /* a domain that can receive mail: MX, or an address record (RFC 5321 5.1) */
  if (!notify_dev() || getenv('NOTIFY_DNS') === '1') {
    if (!checkdnsrr($domain . '.', 'MX') && !checkdnsrr($domain . '.', 'A') && !checkdnsrr($domain . '.', 'AAAA')) invalid();
  }

  /* ---- the entry --------------------------------------------------------- */
  $key = notify_key($email);
  $ipHash = notify_ip_hash();
  [$status, $token] = notify_list(function (array &$list) use ($key, $email, $tag, $ipHash, $now) {
    notify_purge($list, $now);
    $e = $list['subs'][$key] ?? null;
    if (is_array($e) && ($e['status'] ?? '') === 'confirmed') return ['already', null];
    $brake = count($list['mails']) >= GLOBAL_PER_HOUR;
    if (is_array($e) && ($e['status'] ?? '') === 'pending') {
      $recent = array_values(array_filter($e['mails'] ?? [], fn($t) => $t > $now - ADDR_WINDOW));
      if (count($recent) >= ADDR_MAX_MAILS) return ['pending', null];   /* enough mails on the way */
      if ($brake) return ['rate', null];
      $recent[] = $now;
      $list['subs'][$key]['mails'] = $recent;
      $list['subs'][$key]['src_last'] = $tag;
      $list['mails'][] = $now;
      return ['pending', (string)$e['token']];
    }
    /* new, or back after unsubscribing (the tombstone is replaced) */
    if ($brake) return ['rate', null];
    $token = bin2hex(random_bytes(16));
    $list['subs'][$key] = [
      'email' => $email,
      'status' => 'pending',
      'created' => $now,
      'confirmed_at' => null,
      'consent_v' => CONSENT_VERSION,
      'consent_hash' => hash('sha256', CONSENT_TEXT),
      'src' => $tag,
      'token' => $token,
      'ip_hash' => $ipHash,
      'mails' => [$now],
    ];
    $list['mails'][] = $now;
    return ['pending', $token];
  }, true);

  if ($status === 'rate') reply(429, ['ok' => false, 'error' => 'rate']);
  if ($token !== null) {
    try {
      notify_deliver(notify_confirm_mail($email, $token));
    } catch (Throwable $x) {
      notify_error_log('confirmation mail to ' . substr($key, 0, 8) . ': ' . $x->getMessage());
      reply(500, ['ok' => false, 'error' => 'server']);
    }
  }
  reply(200, ['ok' => true, 'status' => $status]);
} catch (Throwable $x) {
  notify_error_log('subscribe: ' . $x->getMessage());
  reply(500, ['ok' => false, 'error' => 'server']);
}
