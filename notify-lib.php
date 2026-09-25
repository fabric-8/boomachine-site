<?php
/* Boo Machine: the launch list. Shared code for subscribe.php, confirm.php,
   unsubscribe.php, notify-admin.php and stats.php (README-NOTIFY.md).

   Not a page: it only defines things, refuses to run when requested directly,
   and the root .htaccess denies it over HTTP as well.

   Storage: _data/notify/ (never served: _data/.htaccess, the root .htaccess
   and a deny file of its own; never touched by the deploy mirror).
     list.json      every entry, keyed by HMAC(secret, email); one file,
                    rewritten atomically (tmp + rename) under list.lock
     secret.json    the persistent HMAC key for addresses and IP hashes
     rl/<hash>      per-IP attempt timestamps (rate limit, 10 minutes)
     campaigns/     one JSON state file and one log per sent campaign
     outbox/        dev only (php -S or NOTIFY_DEV=1): mails as .eml files
     errors.log     delivery failures, without addresses */
declare(strict_types=1);

if (PHP_SAPI !== 'cli' && realpath((string)($_SERVER['SCRIPT_FILENAME'] ?? '')) === __FILE__) {
  http_response_code(404); exit;
}

const NOTIFY_SITE      = 'https://boomachine.app';
const NOTIFY_FROM      = 'noreply@boomachine.app';
const NOTIFY_FROM_NAME = 'Boo Machine';
const NOTIFY_REPLY_TO  = 'support@boomachine.app';
const NOTIFY_SOURCES   = ['hero', 'bar', 'support'];

/* The consent sentence next to the sign-up form (index.html, as the frontend
   had it on 2026-09-25). If the wording there changes, change it here too and
   bump the version: every entry records the version and a hash of this exact
   sentence, as the record of what the person agreed to. */
const CONSENT_VERSION = '2026-09-25';
const CONSENT_TEXT    = 'Leave your email and we’ll tell you at launch and when new discs drop. No spam. Details in our privacy notice.';

const PENDING_DAYS    = 7;       /* unconfirmed entries are deleted after this */
const IP_MAX          = 5;       /* subscribe attempts per IP ... */
const IP_WINDOW       = 600;     /* ... per 10 minutes */
const ADDR_MAX_MAILS  = 3;       /* confirmation mails per address ... */
const ADDR_WINDOW     = 86400;   /* ... per 24 hours */
const GLOBAL_PER_HOUR = 150;     /* confirmation mails per hour, all addresses: the flood brake */

const NOTIFY_DENY = "# Written by notify-lib.php if missing.\n<IfModule mod_authz_core.c>\n  Require all denied\n</IfModule>\n<IfModule !mod_authz_core.c>\n  Order allow,deny\n  Deny from all\n</IfModule>\n";

date_default_timezone_set('Europe/Berlin');

/* ---- environment -------------------------------------------------------- */

/* Dev mode: PHP's built-in server, or NOTIFY_DEV=1 for a CLI run. Mails go to
   _data/notify/outbox/ as .eml files instead of the network. */
function notify_dev(): bool {
  return PHP_SAPI === 'cli-server' || getenv('NOTIFY_DEV') === '1';
}

function notify_base(): string {
  if (PHP_SAPI === 'cli-server') {
    $h = (string)($_SERVER['HTTP_HOST'] ?? '');
    if (preg_match('/^(localhost|127\.0\.0\.1)(:\d+)?$/', $h)) return "http://$h";
  }
  $b = getenv('NOTIFY_BASE_URL');
  return (notify_dev() && is_string($b) && $b !== '') ? rtrim($b, '/') : NOTIFY_SITE;
}

function notify_dir(string $sub = ''): string {
  $dir = __DIR__ . '/_data/notify';
  if (!is_dir($dir) && !@mkdir($dir, 0750, true) && !is_dir($dir)) throw new RuntimeException('notify dir not writable');
  if (!is_file("$dir/.htaccess")) { @file_put_contents("$dir/.htaccess", NOTIFY_DENY); @file_put_contents("$dir/index.html", ''); }
  if ($sub === '') return $dir;
  $d = "$dir/$sub";
  if (!is_dir($d) && !@mkdir($d, 0750, true) && !is_dir($d)) throw new RuntimeException("notify/$sub not writable");
  return $d;
}

/* notify-config.php is written by the deploy (never in git). It is read as
   text, not included (the stats.php pattern): no code runs from it and OPcache
   cannot keep serving a replaced value. Values are PHP single-quoted strings. */
function notify_config(): array {
  static $cfg = null;
  if ($cfg !== null) return $cfg;
  $cfg = [];
  $txt = @file_get_contents(__DIR__ . '/notify-config.php');
  if (!is_string($txt)) return $cfg;
  preg_match_all("/'([a-z_]+)'\\s*=>\\s*'((?:[^'\\\\]|\\\\.)*)'/s", $txt, $m, PREG_SET_ORDER);
  foreach ($m as $x) {
    if (in_array($x[1], ['smtp_host', 'smtp_port', 'smtp_user', 'smtp_pass', 'smtp_secure', 'admin_token'], true)) {
      $cfg[$x[1]] = preg_replace('/\\\\([\\\\\'])/', '$1', $x[2]);
    }
  }
  return $cfg;
}

/* ---- hashing ------------------------------------------------------------ */

function notify_secret(): string {
  static $s = null;
  if ($s !== null) return $s;
  $dir = notify_dir();
  $f = "$dir/secret.json";
  $j = @json_decode((string)@file_get_contents($f), true);
  if (is_array($j) && is_string($j['k'] ?? null) && strlen($j['k']) === 64) return $s = $j['k'];
  $lock = @fopen("$dir/list.lock", 'c');
  if (!$lock || !flock($lock, LOCK_EX)) throw new RuntimeException('lock');
  $j = @json_decode((string)@file_get_contents($f), true);
  if (!(is_array($j) && is_string($j['k'] ?? null) && strlen($j['k']) === 64)) {
    $j = ['k' => bin2hex(random_bytes(32))];
    $tmp = "$f." . bin2hex(random_bytes(4));
    if (@file_put_contents($tmp, json_encode($j)) === false || !@rename($tmp, $f)) { @unlink($tmp); throw new RuntimeException('secret not writable'); }
  }
  flock($lock, LOCK_UN); fclose($lock);
  return $s = $j['k'];
}

function notify_key(string $email): string {
  return substr(hash_hmac('sha256', 'email|' . $email, notify_secret()), 0, 32);
}

function notify_ip_hash(): string {
  return substr(hash_hmac('sha256', 'ip|' . (string)($_SERVER['REMOTE_ADDR'] ?? ''), notify_secret()), 0, 32);
}

/* rate limits count IPv6 per /64 (one customer's whole network) */
function notify_ip_bucket(): string {
  $ip = (string)($_SERVER['REMOTE_ADDR'] ?? '');
  $bin = @inet_pton($ip);
  if (is_string($bin) && strlen($bin) === 16) $ip = bin2hex(substr($bin, 0, 8)) . '::/64';
  return substr(hash_hmac('sha256', 'rl|' . $ip, notify_secret()), 0, 32);
}

/* ---- the list ----------------------------------------------------------- */

/* Runs $fn(&$list) under list.lock (exclusive when $write) and saves the list
   atomically if $fn returns with $list changed. Returns $fn's result. */
function notify_list(callable $fn, bool $write = false): mixed {
  $dir = notify_dir();
  notify_secret();
  $lock = @fopen("$dir/list.lock", 'c');
  if (!$lock || !flock($lock, $write ? LOCK_EX : LOCK_SH)) throw new RuntimeException('lock');
  try {
    $raw = @file_get_contents("$dir/list.json");
    $list = is_string($raw) && $raw !== '' ? json_decode($raw, true) : ['v' => 1, 'subs' => [], 'mails' => []];
    if (!is_array($list) || !is_array($list['subs'] ?? null)) throw new RuntimeException('list.json unreadable');
    $list['mails'] ??= [];
    $before = $write ? $list : null;
    $res = $fn($list);
    if ($write && $list !== $before) {
      $tmp = "$dir/list.json." . bin2hex(random_bytes(4));
      $json = json_encode($list, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
      if ($json === false || @file_put_contents($tmp, $json) === false || !@rename($tmp, "$dir/list.json")) {
        @unlink($tmp); throw new RuntimeException('list.json not writable');
      }
    }
    return $res;
  } finally {
    flock($lock, LOCK_UN); fclose($lock);
  }
}

/* unconfirmed entries older than PENDING_DAYS go; so does the mail log's past */
function notify_purge(array &$list, int $now): void {
  $cut = $now - PENDING_DAYS * 86400;
  foreach ($list['subs'] as $k => $e) {
    if (($e['status'] ?? '') === 'pending' && (int)($e['created'] ?? 0) < $cut) unset($list['subs'][$k]);
  }
  $list['mails'] = array_values(array_filter($list['mails'], fn($t) => $t > $now - 3600));
}

function notify_expired(array $e, int $now): bool {
  return ($e['status'] ?? '') === 'pending' && (int)($e['created'] ?? 0) < $now - PENDING_DAYS * 86400;
}

function notify_valid_token(mixed $t): bool {
  return is_string($t) && preg_match('/^[a-f0-9]{32}$/', $t) === 1;
}

/* key of the live entry with this token, or null */
function notify_by_token(array $list, string $token): ?string {
  foreach ($list['subs'] as $k => $e) {
    if (isset($e['token']) && hash_equals((string)$e['token'], $token)) return (string)$k;
  }
  return null;
}

/* the tombstone: no address, no token; only the keyed hash stays, so the
   address is recognised as withdrawn */
function notify_tombstone(array $e, int $now): array {
  return ['status' => 'unsubscribed', 'unsubscribed_at' => $now];
}

/* ---- the confirmation mail ---------------------------------------------- */

function notify_confirm_mail(string $email, string $token): array {
  $url = notify_base() . '/confirm.php?t=' . $token;
  $site = notify_base();
  $text = <<<TXT
A name went into the machine.
Was it yours? Then press the key:

$url

Press it, and Boo Machine will write to you when it launches on the App Store and when new discs drop. Nothing else, and you can leave the list with one click in every mail.

Didn't sign up? Ignore this mail. Nothing else will come, and the name fades from the ledger within 7 days.

Boo Machine, a cursed disc player for your iPhone
$site
Fabricio Rosa Marques, support@boomachine.app
Legal notice and privacy: $site/legal.html
TXT;
  $u = htmlspecialchars($url, ENT_QUOTES);
  $s = htmlspecialchars($site, ENT_QUOTES);
  $html = <<<HTML
<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="dark"><meta name="supported-color-schemes" content="dark"><title>Confirm your soul</title></head>
<body style="margin:0;padding:0;background:#000000;color:#C4BFBA;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#000000" style="background:#000000;"><tr><td align="center" style="padding:40px 16px 48px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:480px;">
<tr><td align="center" style="padding:0 0 28px;"><img src="$s/assets/apple-touch-icon.png" width="64" height="64" alt="Boo Machine" style="display:block;border:0;border-radius:15px;"></td></tr>
<tr><td align="center" style="padding:0 0 22px;font-family:Georgia,'Times New Roman',serif;font-size:34px;line-height:1.1;font-weight:bold;color:#FF4A32;text-shadow:0 0 2px #F90000,0 0 10px rgba(249,0,0,.55),0 0 26px rgba(249,0,0,.30);">Confirm your soul.</td></tr>
<tr><td align="center" style="padding:0 0 26px;font-family:'Courier Prime','Courier New',Courier,monospace;font-size:16px;line-height:1.65;color:#EEE8DF;">A name went into the machine.<br>Was it yours? Then press the key.</td></tr>
<tr><td align="center" style="padding:0 0 28px;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" bgcolor="#1C0503" style="border:1px solid #F90000;border-radius:6px;background:#1C0503;box-shadow:0 0 14px rgba(249,0,0,.35);">
<a href="$u" style="display:inline-block;padding:14px 30px;font-family:'Courier Prime','Courier New',Courier,monospace;font-size:16px;font-weight:bold;letter-spacing:.06em;color:#FFD0C6;text-decoration:none;">YES, IT WAS ME</a>
</td></tr></table>
</td></tr>
<tr><td align="center" style="padding:0 0 22px;font-family:'Courier Prime','Courier New',Courier,monospace;font-size:14px;line-height:1.65;color:#A19A94;">Press it, and Boo Machine will write to you when it launches on the App Store and when new discs drop. Nothing else, and you can leave the list with one click in every mail.</td></tr>
<tr><td align="center" style="padding:0 0 30px;font-family:'Courier Prime','Courier New',Courier,monospace;font-size:14px;line-height:1.65;color:#A19A94;">Didn't sign up? Ignore this mail. Nothing else will come, and the name fades from the ledger within 7 days.</td></tr>
<tr><td align="center" style="padding:0 0 30px;font-family:'Courier Prime','Courier New',Courier,monospace;font-size:12px;line-height:1.6;color:#7E7872;word-break:break-all;">Button not working? Open this link:<br><a href="$u" style="color:#A19A94;">$u</a></td></tr>
<tr><td align="center" style="border-top:1px solid #1F1D1A;padding:18px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.7;color:#7E7872;">Boo Machine, a cursed disc player for your iPhone<br>Fabricio Rosa Marques &middot; <a href="mailto:support@boomachine.app" style="color:#A19A94;">support@boomachine.app</a> &middot; <a href="$s/legal.html" style="color:#A19A94;">Legal notice and privacy</a></td></tr>
</table>
</td></tr></table>
</body></html>
HTML;
  return notify_message($email, 'Confirm your soul (Boo Machine)', $text, $html, ['Auto-Submitted' => 'auto-generated']);
}

/* ---- MIME --------------------------------------------------------------- */

function notify_crlf(string $s): string { return preg_replace("/\r\n|\r|\n/", "\r\n", $s) ?? $s; }

function notify_header_encode(string $s): string {
  $s = str_replace(["\r", "\n"], ' ', $s);
  if (!preg_match('/[^\x20-\x7E]/', $s)) return $s;
  $out = []; $chunk = '';
  foreach (preg_split('//u', $s, -1, PREG_SPLIT_NO_EMPTY) ?: [] as $ch) {
    if (strlen(base64_encode($chunk . $ch)) > 45) { $out[] = '=?UTF-8?B?' . base64_encode($chunk) . '?='; $chunk = ''; }
    $chunk .= $ch;
  }
  if ($chunk !== '') $out[] = '=?UTF-8?B?' . base64_encode($chunk) . '?=';
  return implode("\r\n ", $out);
}

/* a multipart/alternative message: ['to', 'subject' (encoded), 'headers' => [name => value], 'body'] */
function notify_message(string $to, string $subject, string $text, string $html, array $extra = []): array {
  $b = 'bm-' . bin2hex(random_bytes(12));
  $headers = [
    'Date' => date('r'),
    'From' => NOTIFY_FROM_NAME . ' <' . NOTIFY_FROM . '>',
    'Reply-To' => NOTIFY_REPLY_TO,
    'Message-ID' => '<' . bin2hex(random_bytes(16)) . '@boomachine.app>',
    'MIME-Version' => '1.0',
  ] + $extra + ['Content-Type' => "multipart/alternative; boundary=\"$b\""];
  $qp = fn(string $s) => quoted_printable_encode(notify_crlf($s));
  $body = "--$b\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: quoted-printable\r\n\r\n" . $qp($text)
        . "\r\n--$b\r\nContent-Type: text/html; charset=UTF-8\r\nContent-Transfer-Encoding: quoted-printable\r\n\r\n" . $qp($html)
        . "\r\n--$b--\r\n";
  return ['to' => $to, 'subject' => notify_header_encode($subject), 'headers' => $headers, 'body' => $body];
}

function notify_raw(array $m): string {
  $h = "To: {$m['to']}\r\nSubject: {$m['subject']}\r\n";
  foreach ($m['headers'] as $k => $v) $h .= "$k: $v\r\n";
  return $h . "\r\n" . $m['body'];
}

/* ---- delivery ----------------------------------------------------------- */

/* Sends one message: dev outbox, else authenticated SMTP when notify-config.php
   has smtp_host, else PHP mail() with the envelope sender set (-f), which on
   ALL-INKL hands the mail to the account's own mail server. Throws on failure.
   Pass the same $smtp between calls to reuse one connection (campaigns). */
function notify_deliver(array $m, ?NotifySmtp &$smtp = null): void {
  if (!filter_var($m['to'], FILTER_VALIDATE_EMAIL)) throw new RuntimeException('bad recipient');
  if (notify_dev()) {
    $f = notify_dir('outbox') . '/' . date('Ymd-His') . '-' . bin2hex(random_bytes(3)) . '.eml';
    if (@file_put_contents($f, notify_raw($m)) === false) throw new RuntimeException('outbox not writable');
    return;
  }
  $cfg = notify_config();
  if (($cfg['smtp_host'] ?? '') !== '') {
    $smtp ??= new NotifySmtp($cfg);
    $smtp->send(NOTIFY_FROM, $m['to'], notify_raw($m));
    return;
  }
  $h = '';
  foreach ($m['headers'] as $k => $v) $h .= ($h === '' ? '' : "\r\n") . "$k: $v";
  if (!mail($m['to'], $m['subject'], $m['body'], $h, '-f' . NOTIFY_FROM)) throw new RuntimeException('mail() refused the message');
}

function notify_error_log(string $what): void {
  try {
    @file_put_contents(notify_dir() . '/errors.log', date('c') . ' ' . preg_replace('/[\r\n]+/', ' ', $what) . "\n", FILE_APPEND | LOCK_EX);
  } catch (Throwable) {}
}

/* A small SMTP client: implicit TLS (465) or STARTTLS (587), AUTH LOGIN,
   certificate verified. 'smtp_secure' => 'none' is accepted for localhost
   only (tests); credentials never go over an unencrypted link elsewhere. */
final class NotifySmtp {
  /** @var resource|null */
  private $s = null;
  public int $sent = 0;

  public function __construct(private array $c) {}

  public function send(string $from, string $to, string $raw): void {
    if ($this->s === null) $this->open();
    else $this->cmd('RSET', [250]);
    $this->cmd("MAIL FROM:<$from>", [250]);
    $this->cmd("RCPT TO:<$to>", [250, 251], true);
    $this->cmd('DATA', [354]);
    $data = preg_replace('/^\./m', '..', notify_crlf($raw)) ?? '';
    if (!str_ends_with($data, "\r\n")) $data .= "\r\n";
    $this->write($data . ".\r\n");
    $this->expect([250]);
    $this->sent++;
  }

  public function close(): void {
    if ($this->s) { @fwrite($this->s, "QUIT\r\n"); @fclose($this->s); }
    $this->s = null;
  }

  public function __destruct() { $this->close(); }

  private function open(): void {
    $host = (string)$this->c['smtp_host'];
    $port = (int)($this->c['smtp_port'] ?? 0) ?: 465;
    $sec = strtolower((string)($this->c['smtp_secure'] ?? '')) ?: ($port === 465 ? 'ssl' : 'tls');
    if (!in_array($sec, ['ssl', 'tls', 'none'], true)) throw new RuntimeException('smtp_secure must be ssl, tls or none');
    if ($sec === 'none' && !in_array($host, ['127.0.0.1', 'localhost', '::1'], true)) throw new RuntimeException('smtp: unencrypted only to localhost');
    $ctx = stream_context_create(['ssl' => ['verify_peer' => true, 'verify_peer_name' => true, 'peer_name' => $host, 'SNI_enabled' => true]]);
    $s = @stream_socket_client(($sec === 'ssl' ? 'ssl://' : 'tcp://') . "$host:$port", $en, $es, 15, STREAM_CLIENT_CONNECT, $ctx);
    if (!$s) throw new RuntimeException("smtp connect $host:$port failed: " . ($es ?: (error_get_last()['message'] ?? 'unknown')));
    stream_set_timeout($s, 30);
    $this->s = $s;
    $this->expect([220]);
    $this->cmd('EHLO boomachine.app', [250]);
    if ($sec === 'tls') {
      $this->cmd('STARTTLS', [220]);
      if (!@stream_socket_enable_crypto($s, true, STREAM_CRYPTO_METHOD_TLSv1_2_CLIENT | STREAM_CRYPTO_METHOD_TLSv1_3_CLIENT)) {
        $this->s = null; throw new RuntimeException('smtp STARTTLS failed');
      }
      $this->cmd('EHLO boomachine.app', [250]);
    }
    if (($this->c['smtp_user'] ?? '') !== '') {
      $this->cmd('AUTH LOGIN', [334]);
      $this->cmd(base64_encode((string)$this->c['smtp_user']), [334], false, true);
      $this->cmd(base64_encode((string)($this->c['smtp_pass'] ?? '')), [235], false, true);
    }
  }

  private function write(string $d): void {
    for ($off = 0, $n = strlen($d); $off < $n; ) {
      $w = @fwrite($this->s, substr($d, $off, 8192));
      if ($w === false || $w === 0) { $this->drop(); throw new RuntimeException('smtp write failed'); }
      $off += $w;
    }
  }

  /* $recipient: a 5xx here is about this address, the connection stays usable */
  private function cmd(string $line, array $ok, bool $recipient = false, bool $secret = false): void {
    $this->write("$line\r\n");
    $this->expect($ok, $recipient, $secret ? '(credentials)' : preg_replace('/<[^>]*>/', '<...>', $line));
  }

  private function expect(array $ok, bool $recipient = false, string $what = 'reply'): void {
    $text = '';
    while (true) {
      $l = @fgets($this->s, 1024);
      if ($l === false) { $this->drop(); throw new RuntimeException("smtp: connection lost after $what"); }
      $text .= $l;
      if (strlen($l) < 4 || $l[3] !== '-') break;
    }
    $code = (int)substr($text, 0, 3);
    if (in_array($code, $ok, true)) return;
    $msg = "smtp $what: " . trim(preg_replace('/\s+/', ' ', $text) ?? '');
    if ($recipient && $code >= 500) throw new NotifyRecipientError($msg);
    $this->drop();
    throw new RuntimeException($msg);
  }

  private function drop(): void { if ($this->s) @fclose($this->s); $this->s = null; }
}

final class NotifyRecipientError extends RuntimeException {}

/* ---- analytics ---------------------------------------------------------- */

/* One event straight into a.php's store, e.g. notify_confirmed. Written by the
   server, so it carries nothing about the visitor: the page id and the
   visitor hash are random, device and browser "other". */
function notify_analytics_event(string $event, string $path): void {
  $dir = __DIR__ . '/_data';
  if (!is_dir($dir)) return;
  $rec = ['ts' => time(), 'e' => $event, 'p' => $path, 'id' => substr(base_convert(bin2hex(random_bytes(8)), 16, 36), 0, 10),
          'd' => 'other', 'b' => 'other', 'vh' => bin2hex(random_bytes(8)), 'srv' => 1];
  $fh = @fopen("$dir/events-" . date('Y-m-d') . '.jsonl', 'ab');
  if (!$fh) return;
  if (flock($fh, LOCK_EX)) { fwrite($fh, json_encode($rec, JSON_UNESCAPED_SLASHES) . "\n"); fflush($fh); flock($fh, LOCK_UN); }
  fclose($fh);
}

/* ---- campaigns (notify-admin.php, driven by scripts/notify-send.php) ---- */

function notify_campaign_id_ok(mixed $id): bool {
  return is_string($id) && preg_match('/^[a-z0-9][a-z0-9-]{1,47}$/', $id) === 1;
}

function notify_campaign_file(string $id): string { return notify_dir('campaigns') . "/$id.json"; }

function notify_campaign_load(string $id): ?array {
  $c = @json_decode((string)@file_get_contents(notify_campaign_file($id)), true);
  return is_array($c) ? $c : null;
}

function notify_campaign_save(array $c): void {
  $f = notify_campaign_file($c['id']);
  $tmp = "$f." . bin2hex(random_bytes(4));
  if (@file_put_contents($tmp, json_encode($c, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE)) === false || !@rename($tmp, $f)) {
    @unlink($tmp); throw new RuntimeException('campaign not writable');
  }
}

/* the mail for one recipient: {{unsubscribe_url}} filled in, list headers set */
function notify_campaign_message(array $c, string $email, string $token): array {
  $unsub = notify_base() . '/unsubscribe.php?t=' . $token;
  $text = str_replace('{{unsubscribe_url}}', $unsub, $c['text']);
  $html = str_replace('{{unsubscribe_url}}', htmlspecialchars($unsub, ENT_QUOTES), $c['html']);
  return notify_message($email, $c['subject'], $text, $html, [
    'List-Id' => 'Boo Machine <launch.boomachine.app>',
    'List-Unsubscribe' => "<$unsub>,\r\n <mailto:" . NOTIFY_REPLY_TO . '?subject=unsubscribe>',
    'List-Unsubscribe-Post' => 'List-Unsubscribe=One-Click',
  ]);
}

/* Sends the campaign to every confirmed address it has not reached yet, for at
   most $budget seconds, one mail per $interval seconds, and returns progress.
   Resumable and safe to call again: each address is marked in the campaign
   file right after its mail, and a second concurrent run is refused. The
   list is re-read before every mail, so an unsubscribe mid-run is honoured. */
function notify_campaign_send(string $id, int $budget, float $interval, bool $dry): array {
  $lock = @fopen(notify_dir('campaigns') . "/$id.lock", 'c');
  if (!$lock || !flock($lock, LOCK_EX | LOCK_NB)) return ['error' => 'busy'];
  $log = @fopen(notify_dir('campaigns') . "/$id.log", 'ab');
  $smtp = null;
  try {
    $c = notify_campaign_load($id);
    if (!$c) return ['error' => 'no such campaign'];
    $c['done'] ??= [];
    $queue = function () use (&$c): array {
      return notify_list(function (array &$l) use (&$c) {
        $q = [];
        foreach ($l['subs'] as $k => $e) {
          if (($e['status'] ?? '') === 'confirmed' && !isset($c['done'][$k])) $q[$k] = (int)($e['confirmed_at'] ?? 0);
        }
        asort($q);
        return array_keys($q);
      });
    };
    $q = $queue();
    $confirmed = notify_list(fn(array &$l) => count(array_filter($l['subs'], fn($e) => ($e['status'] ?? '') === 'confirmed')));
    if ($dry) return ['dry_run' => true, 'confirmed' => $confirmed, 'already_sent' => count(array_filter($c['done'], fn($v) => $v === 'sent')), 'would_send' => count($q)];
    $start = microtime(true); $sent = 0; $failed = 0; $error = null;
    $c['started'] ??= time();
    while ($q && microtime(true) - $start < $budget) {
      $k = array_shift($q);
      $e = notify_list(fn(array &$l) => $l['subs'][$k] ?? null);
      if (!is_array($e) || ($e['status'] ?? '') !== 'confirmed') continue;   /* left meanwhile */
      $t0 = microtime(true);
      try {
        notify_deliver(notify_campaign_message($c, (string)$e['email'], (string)$e['token']), $smtp);
        $c['done'][$k] = 'sent'; $sent++; $res = 'sent';
      } catch (NotifyRecipientError $x) {
        $c['done'][$k] = 'failed'; $failed++; $res = 'failed: ' . $x->getMessage();
      } catch (Throwable $x) {
        $error = $x->getMessage(); $res = 'stopped: ' . $error;   /* not marked: retried on the next call */
      }
      notify_campaign_save($c);
      if ($log) fwrite($log, json_encode(['ts' => date('c'), 'key' => $k, 'result' => $res], JSON_UNESCAPED_SLASHES) . "\n");
      if ($error !== null) break;
      $wait = $interval - (microtime(true) - $t0);
      if ($wait > 0 && $q) usleep((int)($wait * 1e6));
    }
    $remaining = count($queue());
    if ($remaining === 0 && $error === null) { $c['finished'] = time(); notify_campaign_save($c); }
    return array_filter(['sent' => $sent, 'failed' => $failed, 'remaining' => $remaining, 'done' => $remaining === 0 && $error === null,
      'total_sent' => count(array_filter($c['done'], fn($v) => $v === 'sent')), 'error' => $error], fn($v) => $v !== null);
  } finally {
    if ($smtp) $smtp->close();
    if ($log) fclose($log);
    flock($lock, LOCK_UN); fclose($lock);
  }
}

/* ---- the pages (confirm.php, unsubscribe.php) ---------------------------- */

function notify_page(int $code, string $title, string $headline, string $body): never {
  http_response_code($code);
  header('Content-Type: text/html; charset=utf-8');
  header('Cache-Control: no-store');
  header('X-Robots-Tag: noindex');
  header('Referrer-Policy: no-referrer');
  $t = htmlspecialchars($title, ENT_QUOTES);
  $h = htmlspecialchars($headline, ENT_QUOTES);
  echo <<<HTML
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<meta name="referrer" content="no-referrer">
<meta name="theme-color" content="#000000">
<title>$t · Boo Machine</title>
<link rel="icon" href="/assets/icon.webp" type="image/webp">
<link rel="preload" href="/fonts/Jacquard12-Regular.woff2" as="font" type="font/woff2" crossorigin>
<style>
@font-face{font-family:"Jacquard12";src:url("/fonts/Jacquard12-Regular.woff2") format("woff2");font-weight:400;font-display:swap}
@font-face{font-family:"Courier Prime";src:url("/fonts/CourierPrime-Regular.woff2") format("woff2");font-weight:400;font-display:swap}
@font-face{font-family:"Courier Prime";src:url("/fonts/CourierPrime-Bold.woff2") format("woff2");font-weight:700;font-display:swap}
:root{--ink:#000;--paper:#EEE8DF;--row:#C4BFBA;--muted:#A19A94;--dim:#7E7872;--red:#F90000;--mono:"Courier Prime","Courier New",ui-monospace,monospace}
*{box-sizing:border-box}
html,body{height:100%}
body{margin:0;padding:0 16px;background:var(--ink);color:var(--row);font-family:var(--mono);font-size:16px;line-height:1.65;-webkit-text-size-adjust:100%;
  background:radial-gradient(70% 48% at 50% 58%,rgba(110,12,8,.26),rgba(96,10,8,.07) 58%,rgba(0,0,0,0) 100%),var(--ink);
  display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100svh;text-align:center}
main{max-width:34rem;padding:64px 0 40px}
.mark{display:block;width:56px;height:56px;margin:0 auto 34px;border-radius:13px;opacity:.9}
h1{margin:0 0 26px;font-family:"Jacquard12",serif;font-weight:400;font-size:clamp(42px,11vw,84px);line-height:.95;letter-spacing:.01em;color:#FF6A52;text-wrap:balance;
  text-shadow:0 0 .014em rgba(249,0,0,.95),0 0 .03em rgba(249,0,0,.6),0 -.01em .05em rgba(255,128,104,.48),0 -.02em .15em rgba(255,58,36,.32),0 0 .44em rgba(249,0,0,.17),0 0 1.05em rgba(236,14,8,.09),0 2px 6px rgba(0,0,0,.72)}
p{margin:0 auto 16px;max-width:30rem;color:var(--paper);text-wrap:pretty}
p.small{font-size:14px;color:var(--muted)}
a{color:var(--paper);text-decoration:underline;text-decoration-color:rgba(238,232,223,.35);text-underline-offset:3px}
a:hover{text-decoration-color:var(--red)}
:focus-visible{outline:2px solid #B39A78;outline-offset:4px}
form{margin:26px 0 10px}
button{font:700 15px/1 var(--mono);letter-spacing:.08em;text-transform:uppercase;color:#FFD0C6;background:#1C0503;border:1px solid var(--red);border-radius:6px;padding:15px 28px;cursor:pointer;box-shadow:0 0 14px rgba(249,0,0,.30)}
button:hover{background:#2A0704;box-shadow:0 0 20px rgba(249,0,0,.45)}
.home{display:inline-block;margin-top:30px;font-size:13px;letter-spacing:.14em;text-transform:uppercase;color:var(--muted);text-decoration:none}
.home:hover{color:var(--paper)}
footer{padding:0 0 28px;font:11px/1.6 var(--mono);letter-spacing:.12em;text-transform:uppercase;color:#6E6862}
footer a{color:#8E8780;text-decoration:none}
@media (prefers-reduced-motion:no-preference){h1{animation:hum 7s linear infinite}}
@keyframes hum{0%,91%,100%{opacity:1}92%{opacity:.62}93%{opacity:.95}95%{opacity:.7}96%{opacity:1}}
</style>
</head>
<body>
<main>
<a href="/" aria-label="Boo Machine home"><img class="mark" src="/assets/icon.webp" width="56" height="56" alt=""></a>
<h1>$h</h1>
$body
<a class="home" href="/">&larr; Back to the machine</a>
</main>
<footer>&copy; 2026 Fabricio Rosa Marques &middot; <a href="/legal.html#privacy">Privacy</a></footer>
</body>
</html>
HTML;
  exit;
}
