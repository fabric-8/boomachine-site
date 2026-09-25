<?php
/* Boo Machine: the event collector for analytics.js.

   One POST = one event, a small JSON object. Everything not on the whitelist
   below is dropped; what is kept is appended as one JSON line to
   _data/events-YYYY-MM-DD.jsonl (Europe/Berlin days).

   Privacy (legal.html#privacy): no cookies, the IP address and the full
   user agent are never stored. Unique visitors are counted with
     vh = sha256(daily salt | IP | user agent), first 16 hex chars
   where the salt is random, lives only in _data/salt.json and is replaced
   (the old one overwritten) on the first request of each new day, so a
   visitor's hash cannot be linked across days or reversed once the day is
   over. Bots, Do Not Track / Global Privacy Control, cross-site posts and
   more than MAX_PER_DAY events per hash and day are dropped silently.
   Event files older than KEEP_DAYS are deleted (checked on ~1 % of requests).

   Responses: 204 accepted or silently dropped, 400 malformed, 405 not POST,
   413 too large, 500 storage not writable. */
declare(strict_types=1);

const MAX_BYTES   = 2048;
const MAX_PER_DAY = 200;
const KEEP_DAYS   = 400;
const EVENTS = [
  'pageview', 'engaged', 'scroll_25', 'scroll_50', 'scroll_75', 'scroll_100',
  'story_chapter_1', 'story_chapter_2', 'story_chapter_3', 'disc_change',
  'intro_complete', 'beta_click', 'press_kit_download', 'mailto_click',
  'notify_submit', 'notify_confirmed', 'store_click',   /* launch list (README-NOTIFY.md);
     confirm.php also writes notify_confirmed itself, with a random page id and hash */
];
const DEVICES = ['phone', 'tablet', 'desktop'];
const SOURCES = ['slide', 'bar', 'link'];                 /* beta_click (old data) */
const NOTIFY_SOURCES = ['hero', 'bar', 'support'];       /* notify_submit */
const STORE_SOURCES = ['hero', 'bar', 'support', 'slide', 'link'];   /* store_click */
const DENY = "# Written by a.php if missing; the same file is in git.\n<IfModule mod_authz_core.c>\n  Require all denied\n</IfModule>\n<IfModule !mod_authz_core.c>\n  Order allow,deny\n  Deny from all\n</IfModule>\n";
const BOTS = '/bot|crawl|spider|slurp|scrap|headless|phantom|selenium|puppeteer|playwright|lighthouse|pagespeed|gtmetrix|pingdom|uptime|monitor|preview|facebookexternalhit|embedly|curl|wget|python|java\/|go-http|okhttp|axios|node-fetch|undici|libwww|httpclient|http_request|guzzle|postman|insomnia/i';

date_default_timezone_set('Europe/Berlin');
header('Cache-Control: no-store');
header('X-Robots-Tag: noindex');

function out(int $code): never { http_response_code($code); exit; }

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') { header('Allow: POST'); out(405); }
if ((int)($_SERVER['CONTENT_LENGTH'] ?? 0) > MAX_BYTES) out(413);

/* same-site only: a browser's beacon from the page itself */
$host = strtolower((string)($_SERVER['HTTP_HOST'] ?? ''));
$origin = (string)($_SERVER['HTTP_ORIGIN'] ?? '');
if ($origin !== '' && strtolower((string)parse_url($origin, PHP_URL_HOST)) !== preg_replace('/:\d+$/', '', $host)) out(204);
$site = (string)($_SERVER['HTTP_SEC_FETCH_SITE'] ?? '');
if ($site !== '' && $site !== 'same-origin') out(204);

/* Do Not Track / Global Privacy Control (analytics.js checks too) */
if (($_SERVER['HTTP_DNT'] ?? '') === '1' || ($_SERVER['HTTP_SEC_GPC'] ?? '') === '1') out(204);

$ua = (string)($_SERVER['HTTP_USER_AGENT'] ?? '');
if ($ua === '' || strlen($ua) > 512 || preg_match(BOTS, $ua)) out(204);

$raw = file_get_contents('php://input', false, null, 0, MAX_BYTES + 1);
if ($raw === false || $raw === '') out(400);
if (strlen($raw) > MAX_BYTES) out(413);
$in = json_decode($raw, true, 4);
if (!is_array($in)) out(400);

/* ---- the whitelist ------------------------------------------------------ */
$ev = $in['e'] ?? null;
if (!is_string($ev) || !in_array($ev, EVENTS, true)) out(400);
$path = $in['p'] ?? '/';
if (!is_string($path) || !preg_match('#^/[A-Za-z0-9._/-]{0,80}$#', $path)) out(400);
$pid = $in['id'] ?? '';
if (!is_string($pid) || !preg_match('/^[a-z0-9]{4,16}$/', $pid)) out(400);
$dev = $in['v'] ?? '';
if (!is_string($dev) || !in_array($dev, DEVICES, true)) $dev = 'other';

$rec = ['ts' => time(), 'e' => $ev, 'p' => $path, 'id' => $pid];
$lang = $in['l'] ?? '';
if (is_string($lang) && preg_match('/^[a-z]{2}$/', $lang)) $rec['l'] = $lang;
$ref = $in['r'] ?? '';
if (is_string($ref) && strlen($ref) <= 100 && preg_match('/^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$/i', $ref)) $rec['r'] = strtolower($ref);
foreach (['us', 'um', 'uc'] as $k) {
  $v = $in[$k] ?? '';
  if (!is_string($v)) continue;
  $v = trim(substr(preg_replace('#[^A-Za-z0-9 ._+~/-]#', '', $v) ?? '', 0, 64));
  if ($v !== '') $rec[$k] = strtolower($v);
}
$src = $in['s'] ?? '';
$srcs = match ($ev) { 'beta_click' => SOURCES, 'notify_submit' => NOTIFY_SOURCES, 'store_click' => STORE_SOURCES, default => [] };
if (is_string($src) && in_array($src, $srcs, true)) $rec['s'] = $src;
$rec['d'] = $dev;
$rec['b'] = match (true) {
  str_contains($ua, 'Edg/') || str_contains($ua, 'EdgiOS') || str_contains($ua, 'EdgA/') => 'edge',
  str_contains($ua, 'OPR/') || str_contains($ua, 'SamsungBrowser') || str_contains($ua, 'YaBrowser') => 'other',
  str_contains($ua, 'Firefox/') || str_contains($ua, 'FxiOS') => 'firefox',
  str_contains($ua, 'Chrome/') || str_contains($ua, 'CriOS') => 'chrome',
  str_contains($ua, 'Safari/') => 'safari',
  default => 'other',
};

/* ---- storage ------------------------------------------------------------ */
$dir = __DIR__ . '/_data';
if (!is_dir($dir) && !@mkdir($dir, 0750, true) && !is_dir($dir)) out(500);
if (!is_file("$dir/.htaccess")) {
  @file_put_contents("$dir/.htaccess", DENY);
  @file_put_contents("$dir/index.html", '');
}
$today = date('Y-m-d');

/* the day's salt: created on the first request of a day, the previous one
   overwritten, so yesterday's hashes can no longer be recomputed */
$lock = @fopen("$dir/salt.lock", 'c');
if (!$lock || !flock($lock, LOCK_EX)) out(500);
$salt = @json_decode((string)@file_get_contents("$dir/salt.json"), true);
if (!is_array($salt) || ($salt['day'] ?? '') !== $today || !is_string($salt['salt'] ?? null)) {
  $salt = ['day' => $today, 'salt' => bin2hex(random_bytes(32))];
  $tmp = "$dir/salt.json." . bin2hex(random_bytes(4));
  if (@file_put_contents($tmp, json_encode($salt)) === false || !@rename($tmp, "$dir/salt.json")) { @unlink($tmp); out(500); }
  /* yesterday's rate-limit counters are keyed by yesterday's hashes: gone too */
  foreach (glob("$dir/rl-*", GLOB_ONLYDIR) ?: [] as $old) {
    if ($old !== "$dir/rl-$today") { array_map('unlink', glob("$old/*") ?: []); @rmdir($old); }
  }
}
flock($lock, LOCK_UN); fclose($lock);

$ip = (string)($_SERVER['REMOTE_ADDR'] ?? '');
$rec['vh'] = substr(hash('sha256', $salt['salt'] . '|' . $ip . '|' . $ua), 0, 16);
unset($ip);

/* rate limit: MAX_PER_DAY events per visitor hash and day */
$rl = "$dir/rl-$today";
if (!is_dir($rl)) @mkdir($rl, 0750);
$cf = @fopen("$rl/{$rec['vh']}", 'c+');
if ($cf && flock($cf, LOCK_EX)) {
  $n = (int)stream_get_contents($cf);
  if ($n >= MAX_PER_DAY) { flock($cf, LOCK_UN); fclose($cf); out(204); }
  ftruncate($cf, 0); rewind($cf); fwrite($cf, (string)($n + 1));
  flock($cf, LOCK_UN); fclose($cf);
}

$line = json_encode($rec, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) . "\n";
$fh = @fopen("$dir/events-$today.jsonl", 'ab');
if (!$fh || !flock($fh, LOCK_EX)) out(500);
fwrite($fh, $line);
fflush($fh);
flock($fh, LOCK_UN);
fclose($fh);

/* retention, on ~1 % of requests */
if (random_int(1, 100) === 1) {
  $cut = date('Y-m-d', strtotime('-' . KEEP_DAYS . ' days'));
  foreach (glob("$dir/events-*.jsonl") ?: [] as $f) {
    if (preg_match('/events-(\d{4}-\d{2}-\d{2})\.jsonl$/', $f, $m) && $m[1] < $cut) @unlink($f);
  }
}
out(204);
