<?php
/* Boo Machine: the launch list's confirmation link (README-NOTIFY.md).

     GET  /confirm.php?t=<token>   the link in the confirmation mail
     POST /confirm.php  t=<token>  confirms (the GET page submits it itself)

   Why the extra step: mail security scanners open every link in a mail. A
   confirmation on plain GET would let a scanner confirm an address its owner
   never confirmed, and double opt-in is only worth its record if the owner
   clicked. So GET only shows the page, which posts the token back at once
   (script) or on a button press (no script); scanners rarely do either.

   Idempotent: a confirmed token shows "You're on the list." every time.
   Unknown, withdrawn or expired (PENDING_DAYS) token: 410 with a plain note.
   The first confirmation writes the analytics event notify_confirmed. */
declare(strict_types=1);

require __DIR__ . '/notify-lib.php';

$post = ($_SERVER['REQUEST_METHOD'] ?? '') === 'POST';
if (!$post && ($_SERVER['REQUEST_METHOD'] ?? '') !== 'GET' && ($_SERVER['REQUEST_METHOD'] ?? '') !== 'HEAD') {
  header('Allow: GET, POST'); http_response_code(405); exit;
}
$t = $post ? ($_POST['t'] ?? '') : ($_GET['t'] ?? '');

function gone(): never {
  notify_page(410, 'Link expired', 'The link went cold.',
    '<p>This link has expired or was already used.</p>'
    . '<p class="small">Confirmation links work for ' . PENDING_DAYS . ' days. Sign up again on the home page, and a fresh one will come.</p>');
}

if (!notify_valid_token($t)) gone();
$now = time();

try {
  if ($post) {
    $first = notify_list(function (array &$list) use ($t, $now) {
      notify_purge($list, $now);
      $k = notify_by_token($list, $t);
      if ($k === null || ($list['subs'][$k]['status'] ?? '') !== 'pending') return false;
      $list['subs'][$k]['status'] = 'confirmed';
      $list['subs'][$k]['confirmed_at'] = $now;
      $list['subs'][$k]['confirm_ip_hash'] = notify_ip_hash();
      return true;
    }, true);
    if ($first) notify_analytics_event('notify_confirmed', '/confirm.php');
    header('Location: confirm.php?t=' . $t, true, 303);
    exit;
  }
  $e = notify_list(function (array &$list) use ($t, $now) {
    $k = notify_by_token($list, $t);
    return $k === null ? null : $list['subs'][$k];
  });
} catch (Throwable $x) {
  notify_error_log('confirm: ' . $x->getMessage());
  notify_page(500, 'Something broke', 'The machine jammed.', '<p>Please try the link again in a minute.</p>');
}

if (!is_array($e) || notify_expired($e, $now)) gone();

if (($e['status'] ?? '') === 'confirmed') {
  notify_page(200, "You're on the list", "You're on the list.",
    '<p>Boo Machine will write to you when it launches on the App Store, and when new discs drop. Nothing else.</p>'
    . '<p class="small">Changed your mind? <a href="unsubscribe.php?t=' . $t . '">Leave the list</a>.</p>');
}

/* pending: post the token back (script at once, button without script) */
notify_page(200, 'Confirm', 'One more press.',
  '<p>Press the key, and your name is in the ledger.</p>'
  . '<form id="c" method="post" action="confirm.php"><input type="hidden" name="t" value="' . $t . '">'
  . '<button type="submit">Yes, it was me</button></form>'
  . '<script>document.getElementById("c").submit()</script>');
