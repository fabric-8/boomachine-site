<?php
/* Boo Machine: aggregates of the events a.php collected, as JSON.

     GET /stats.php?days=30     Authorization: Bearer <token>

   The token is in analytics-config.php (<?php return ['token' => '...'];),
   which is NOT in git: the deploy workflow writes it from the GitHub secret
   ANALYTICS_TOKEN. No config, or a token shorter than 32 characters: every
   request is refused (503). Wrong or missing token: 401.
   scripts/analytics-report.sh (token from the macOS Keychain) prints a summary.

   Visitor hashes change every day, so "visitors" over a period is the sum of
   the daily unique visitors (visitor-days), never people across days. */
declare(strict_types=1);

date_default_timezone_set('Europe/Berlin');
header('Cache-Control: no-store');
header('X-Robots-Tag: noindex');
header('Content-Type: application/json; charset=utf-8');

function fail(int $code, string $msg): never {
  http_response_code($code);
  echo json_encode(['error' => $msg]), "\n";
  exit;
}

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'GET') { header('Allow: GET'); fail(405, 'GET only'); }

/* read as text, not included: no code runs from it, and OPcache cannot keep
   serving a replaced token */
$cfg = @file_get_contents(__DIR__ . '/analytics-config.php');
$token = is_string($cfg) && preg_match("/'token'\\s*=>\\s*'([A-Za-z0-9]{32,256})'/", $cfg, $m) ? $m[1] : '';
if ($token === '') fail(503, 'stats are not configured');

/* the header, however the server hands it to PHP (FastCGI setups often
   drop Authorization; the root .htaccess copies it into the environment) */
$auth = (string)($_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '');
if ($auth === '' && function_exists('getallheaders')) {
  foreach (getallheaders() as $k => $v) if (strcasecmp($k, 'Authorization') === 0) $auth = (string)$v;
}
$given = preg_match('/^Bearer\s+(\S+)$/i', trim($auth), $m) ? $m[1] : '';
if ($given === '' || !hash_equals($token, $given)) {
  usleep(300000);
  header('WWW-Authenticate: Bearer');
  fail(401, 'unauthorized');
}

$days = (int)($_GET['days'] ?? 30);
$days = max(1, min(400, $days));
$dir = __DIR__ . '/_data';

$daily = [];
$ev = [];                                   /* event => count */
$pages = [];                                /* path => pageviews */
$refs = []; $utm = []; $dev = []; $brow = []; $lang = []; $betaSrc = [];
$notifySrc = []; $storeSrc = [];
$pvIds = [];                                /* pageview ids on "/" */
$reach = [];                                /* event => [id => 1] (home page only) */
$visPv = []; $visBeta = []; $visEngaged = []; $visDisc = [];   /* "day|vh" => 1 */
$visNotify = []; $visStore = [];

for ($i = $days - 1; $i >= 0; $i--) {
  $day = date('Y-m-d', strtotime("-$i days"));
  $d = ['date' => $day, 'pageviews' => 0, 'visitors' => 0, 'beta_clicks' => 0,
        'notify_submits' => 0, 'notify_confirmed' => 0, 'store_clicks' => 0, 'events' => 0];
  $uniq = [];
  $f = "$dir/events-$day.jsonl";
  $fh = is_file($f) ? @fopen($f, 'rb') : false;
  if ($fh) {
    flock($fh, LOCK_SH);
    while (($line = fgets($fh)) !== false) {
      $r = json_decode($line, true);
      if (!is_array($r) || !isset($r['e'], $r['vh'])) continue;
      $e = (string)$r['e']; $vk = $day . '|' . $r['vh']; $id = (string)($r['id'] ?? '');
      $home = ($r['p'] ?? '') === '/';
      $d['events']++;
      $ev[$e] = ($ev[$e] ?? 0) + 1;
      if ($e === 'pageview') {
        $d['pageviews']++;
        $uniq[$r['vh']] = 1;
        $visPv[$vk] = 1;
        $p = (string)($r['p'] ?? '?');
        $pages[$p] = ($pages[$p] ?? 0) + 1;
        if ($home) $pvIds[$id] = 1;
        $refs[$r['r'] ?? '(direct / none)'] = ($refs[$r['r'] ?? '(direct / none)'] ?? 0) + 1;
        if (isset($r['us']) || isset($r['um']) || isset($r['uc'])) {
          $k = ($r['us'] ?? '-') . ' / ' . ($r['um'] ?? '-') . ' / ' . ($r['uc'] ?? '-');
          $utm[$k] = ($utm[$k] ?? 0) + 1;
        }
        $x = (string)($r['d'] ?? 'other'); $dev[$x] = ($dev[$x] ?? 0) + 1;
        $x = (string)($r['b'] ?? 'other'); $brow[$x] = ($brow[$x] ?? 0) + 1;
        $x = (string)($r['l'] ?? '?'); $lang[$x] = ($lang[$x] ?? 0) + 1;
      } else {
        if ($home && $id !== '') $reach[$e][$id] = 1;
        if ($e === 'beta_click') {
          $d['beta_clicks']++; $visBeta[$vk] = 1;
          $x = (string)($r['s'] ?? '?'); $betaSrc[$x] = ($betaSrc[$x] ?? 0) + 1;
        }
        if ($e === 'notify_submit') {
          $d['notify_submits']++; $visNotify[$vk] = 1;
          $x = (string)($r['s'] ?? '?'); $notifySrc[$x] = ($notifySrc[$x] ?? 0) + 1;
        }
        if ($e === 'notify_confirmed') $d['notify_confirmed']++;   /* written by confirm.php, random vh */
        if ($e === 'store_click') {
          $d['store_clicks']++; $visStore[$vk] = 1;
          $x = (string)($r['s'] ?? '?'); $storeSrc[$x] = ($storeSrc[$x] ?? 0) + 1;
        }
        if ($e === 'engaged') $visEngaged[$vk] = 1;
        if ($e === 'disc_change') $visDisc[$vk] = 1;
      }
    }
    flock($fh, LOCK_UN); fclose($fh);
  }
  $d['visitors'] = count($uniq);
  $daily[] = $d;
}

function top(array $a, int $n = 20): array { arsort($a); return array_slice($a, 0, $n, true); }
function share(int $num, int $den): ?float { return $den > 0 ? round($num / $den, 4) : null; }

$homePv = count($pvIds);
$funnel = function (array $names) use ($reach, $pvIds, $homePv): array {
  $o = ['pageviews' => $homePv];
  foreach ($names as $n) {
    $c = count(array_intersect_key($reach[$n] ?? [], $pvIds));
    $o[$n] = ['pageviews' => $c, 'rate' => share($c, $homePv)];
  }
  return $o;
};
$visitors = count($visPv);
$withBeta = count(array_intersect_key($visBeta, $visPv));
$withNotify = count(array_intersect_key($visNotify, $visPv));
$withStore = count(array_intersect_key($visStore, $visPv));

/* the launch list right now: numbers only (notify-lib.php's store) */
$list = null;
$nd = "$dir/notify";
if (is_file("$nd/list.json") && ($lk = @fopen("$nd/list.lock", 'c'))) {
  flock($lk, LOCK_SH);
  $l = json_decode((string)@file_get_contents("$nd/list.json"), true);
  flock($lk, LOCK_UN); fclose($lk);
  if (is_array($l['subs'] ?? null)) {
    $list = ['pending' => 0, 'confirmed' => 0, 'unsubscribed' => 0];
    foreach ($l['subs'] as $e) { $x = (string)($e['status'] ?? ''); if (isset($list[$x])) $list[$x]++; }
  }
}

$totalPv = array_sum(array_column($daily, 'pageviews'));
echo json_encode([
  'generated' => date('c'),
  'days' => $days,
  'from' => $daily[0]['date'],
  'to' => $daily[count($daily) - 1]['date'],
  'totals' => [
    'pageviews' => $totalPv,
    'visitors' => $visitors,                      /* sum of daily uniques */
    'events' => array_sum(array_column($daily, 'events')),
  ],
  'beta' => [
    'clicks' => $ev['beta_click'] ?? 0,
    'visitors_with_click' => $withBeta,
    'conversion' => share($withBeta, $visitors),
    'by_source' => top($betaSrc),
  ],
  'notify' => [
    'submits' => $ev['notify_submit'] ?? 0,
    'visitors_with_submit' => $withNotify,
    'conversion' => share($withNotify, $visitors),
    'by_source' => top($notifySrc),
    'confirmed' => $ev['notify_confirmed'] ?? 0,
    'list' => $list,
  ],
  'store' => [
    'clicks' => $ev['store_click'] ?? 0,
    'visitors_with_click' => $withStore,
    'conversion' => share($withStore, $visitors),
    'by_source' => top($storeSrc),
  ],
  'engagement' => [
    'engaged_visitors' => count($visEngaged), 'engaged_rate' => share(count($visEngaged), $visitors),
    'disc_visitors' => count($visDisc), 'disc_rate' => share(count($visDisc), $visitors),
  ],
  'daily' => $daily,
  'events' => top($ev, 50),
  'pages' => top($pages),
  'referrers' => top($refs),
  'utm' => top($utm),
  'devices' => top($dev),
  'browsers' => top($brow),
  'languages' => top($lang, 15),
  'scroll_funnel' => $funnel(['scroll_25', 'scroll_50', 'scroll_75', 'scroll_100']),
  'story_funnel' => $funnel(['intro_complete', 'story_chapter_1', 'story_chapter_2', 'story_chapter_3']),
  'health' => [
    'data_dir' => is_dir($dir) ? (is_writable($dir) ? 'writable' : 'read-only') : 'missing',
    'salt_day' => (@json_decode((string)@file_get_contents("$dir/salt.json"), true) ?: [])['day'] ?? null,
    'php' => PHP_VERSION,
  ],
], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE), "\n";
