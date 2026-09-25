<?php
/* Boo Machine: sends a mail to everyone confirmed on the launch list, e.g. the
   launch mail or a "new disc" mail (README-NOTIFY.md).

   It runs on your Mac and drives notify-admin.php on the server over HTTPS,
   which does the sending in short batches (shared hosting cuts long requests
   off): this script calls "send" again and again until the server says done.
   Interrupt it any time (ctrl-C) and run the same command again: the server
   remembers who has the mail, nobody gets it twice.

     php scripts/notify-send.php --id launch \
         --subject-file mail/launch.subject.txt --text mail/launch.txt --html mail/launch.html \
         [--test you@example.org]   one preview mail to you, nothing else
         [--dry-run]                how many would get it, nothing sent
         [--interval 1]             seconds between mails (default 1)
         [--yes]                    no "type SEND" question
         [--retry-failed]           try the addresses that failed last time again
         [--url https://boomachine.app]  (e.g. http://localhost:8802 to test)
         [--log file]               default notify-send-<id>.log in the current folder

   The text and the HTML must contain {{unsubscribe_url}}; the server puts each
   recipient's own link there and adds List-Unsubscribe and
   List-Unsubscribe-Post (one-click) headers.

   Token: $NOTIFY_ADMIN_TOKEN, else the macOS Keychain entry that
   scripts/new-notify-token.sh made (service boomachine-notify, account admin).
   It goes to curl on stdin, never on a command line. */
declare(strict_types=1);

if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
date_default_timezone_set('Europe/Berlin');

$o = getopt('', ['id:', 'subject-file:', 'text:', 'html:', 'test:', 'dry-run', 'interval:', 'yes', 'retry-failed', 'url:', 'log:', 'help']);
if (isset($o['help']) || !isset($o['id'])) {
  fwrite(STDERR, "usage: php scripts/notify-send.php --id <campaign> --subject-file F --text F --html F [--test ADDR | --dry-run] [--interval S] [--yes] [--retry-failed] [--url URL]\n");
  exit(2);
}
$id = (string)$o['id'];
if (!preg_match('/^[a-z0-9][a-z0-9-]{1,47}$/', $id)) die("--id: 2-48 characters of a-z 0-9 -\n");
$base = rtrim((string)($o['url'] ?? 'https://boomachine.app'), '/');
$interval = (float)($o['interval'] ?? 1);
$logFile = (string)($o['log'] ?? "notify-send-$id.log");

$token = getenv('NOTIFY_ADMIN_TOKEN') ?: '';
if ($token === '') $token = trim((string)shell_exec('security find-generic-password -s boomachine-notify -a admin -w 2>/dev/null'));
if (!preg_match('/^[A-Za-z0-9]{32,256}$/', $token)) die("No admin token: set NOTIFY_ADMIN_TOKEN or run scripts/new-notify-token.sh\n");

function logline(string $s): void {
  global $logFile;
  $l = date('c') . " $s";
  echo $l, "\n";
  file_put_contents($logFile, $l . "\n", FILE_APPEND);
}

/* one request to notify-admin.php; the token goes to curl on stdin */
function api(string $method, array $body = [], string $query = ''): array {
  global $base, $token;
  $cmd = ['curl', '-sS', '-X', $method, '-H', '@-', '-w', '\n%{http_code}', '--max-time', '120'];
  $tmp = null;
  if ($method === 'POST') {
    $tmp = tempnam(sys_get_temp_dir(), 'notify');
    file_put_contents($tmp, json_encode($body));
    array_push($cmd, '-H', 'Content-Type: application/json', '--data-binary', "@$tmp");
  }
  $cmd[] = "$base/notify-admin.php$query";
  $p = proc_open($cmd, [0 => ['pipe', 'r'], 1 => ['pipe', 'w'], 2 => ['pipe', 'w']], $pipes);
  if (!is_resource($p)) throw new RuntimeException('curl did not start');
  fwrite($pipes[0], "Authorization: Bearer $token\n"); fclose($pipes[0]);
  $out = stream_get_contents($pipes[1]); $err = stream_get_contents($pipes[2]);
  fclose($pipes[1]); fclose($pipes[2]); proc_close($p);
  if ($tmp) @unlink($tmp);
  $cut = strrpos((string)$out, "\n");
  $code = (int)substr((string)$out, $cut + 1);
  $json = json_decode(substr((string)$out, 0, (int)$cut), true);
  if ($code === 0) throw new RuntimeException("no answer from $base: " . trim($err));
  return [$code, is_array($json) ? $json : ['raw' => substr((string)$out, 0, 300)]];
}

try {
  if (isset($o['retry-failed'])) {
    [$code, $r] = api('POST', ['action' => 'retry_failed', 'id' => $id]);
    if ($code !== 200) die("retry_failed: HTTP $code " . json_encode($r) . "\n");
    logline("$id: {$r['cleared']} failed addresses will be tried again");
  }
  foreach (['subject-file', 'text', 'html'] as $f) if (!isset($o[$f]) || !is_readable($o[$f])) die("--$f: file missing or unreadable\n");
  $subject = trim((string)file_get_contents($o['subject-file']));
  $text = (string)file_get_contents($o['text']);
  $html = (string)file_get_contents($o['html']);
  foreach (['text' => $text, 'html' => $html] as $k => $v) {
    if (!str_contains($v, '{{unsubscribe_url}}')) die("--$k has no {{unsubscribe_url}}\n");
    if (preg_match('/\{\{(?!unsubscribe_url\}\})[^}]*\}\}/', $v, $m)) die("--$k still has the placeholder {$m[0]}: fill it in first\n");
  }
  if ($subject === '' || str_contains($subject, '{{')) die("--subject-file: empty or still a placeholder\n");

  [$code, $r] = api('POST', ['action' => 'campaign', 'id' => $id, 'subject' => $subject, 'text' => $text, 'html' => $html]);
  if ($code !== 200) die("campaign: HTTP $code " . json_encode($r) . "\n");
  logline("$id: campaign " . ($r['created'] ? 'created' : 'exists (same text), resuming; sent so far ' . $r['sent_so_far']) . " at $base");

  if (isset($o['test'])) {
    [$code, $r] = api('POST', ['action' => 'test', 'id' => $id, 'to' => (string)$o['test']]);
    if ($code !== 200) die("test: HTTP $code " . json_encode($r) . "\n");
    logline("$id: test mail sent to {$o['test']}");
    exit(0);
  }

  [$code, $r] = api('POST', ['action' => 'send', 'id' => $id, 'dry_run' => true]);
  if ($code !== 200) die("dry run: HTTP $code " . json_encode($r) . "\n");
  logline("$id: {$r['confirmed']} confirmed, {$r['already_sent']} already have it, {$r['would_send']} to send");
  if (isset($o['dry-run']) || $r['would_send'] === 0) exit(0);

  if (!isset($o['yes'])) {
    echo "Send \"$subject\" to {$r['would_send']} addresses, one every {$interval} s? Type SEND: ";
    if (trim((string)fgets(STDIN)) !== 'SEND') die("Nothing sent.\n");
  }
  $pause = 2; $errors = 0;
  while (true) {
    if ($errors >= 12) { logline("$id: giving up after $errors errors in a row; run the same command again to resume"); exit(1); }
    [$code, $r] = api('POST', ['action' => 'send', 'id' => $id, 'budget' => 20, 'interval' => $interval]);
    if ($code === 409) { logline("$id: another run is sending, waiting"); sleep(10); continue; }
    if ($code !== 200) { $errors++; logline("$id: HTTP $code " . json_encode($r) . ", retrying in {$pause}s"); sleep($pause); $pause = min(120, $pause * 2); continue; }
    logline("$id: +{$r['sent']} sent, {$r['failed']} failed, {$r['remaining']} to go (total sent {$r['total_sent']})" . (isset($r['error']) ? " - stopped: {$r['error']}" : ''));
    if (!empty($r['done'])) break;
    if (isset($r['error'])) { $errors++; sleep($pause); $pause = min(120, $pause * 2); } else { $pause = 2; $errors = 0; }
  }
  logline("$id: done");
} catch (Throwable $x) {
  logline("$id: " . $x->getMessage());
  exit(1);
}
