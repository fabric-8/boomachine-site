<?php
/* Boo Machine: leaving the launch list (README-NOTIFY.md).

     GET  /unsubscribe.php?t=<token>   the link in every mail: shows one button
     POST /unsubscribe.php  t=<token>  the button: unsubscribes, then "done"
     POST /unsubscribe.php?t=<token>   with body List-Unsubscribe=One-Click:
                                       RFC 8058 one-click from the mail app

   GET never unsubscribes on its own: mail scanners open every link, and
   nobody should lose their place because a scanner looked at a mail.

   Unsubscribing deletes the address and the token. What stays is a tombstone
   keyed by HMAC(secret, address): it holds no address, and only records that
   this address left and when, so nothing is ever sent to it again. Signing up
   again later (new double opt-in) replaces it. */
declare(strict_types=1);

require __DIR__ . '/notify-lib.php';

$method = $_SERVER['REQUEST_METHOD'] ?? '';
if (!in_array($method, ['GET', 'HEAD', 'POST'], true)) { header('Allow: GET, POST'); http_response_code(405); exit; }
$post = $method === 'POST';
$oneClick = $post && ($_POST['List-Unsubscribe'] ?? '') === 'One-Click';
$t = $_POST['t'] ?? $_GET['t'] ?? '';

function left(): never {
  notify_page(200, "You're off the list", "You're off the list.",
    '<p>Your address is deleted. Nothing more will come.</p>'
    . '<p class="small">If this was a slip, sign up again on the home page.</p>');
}

if (!$post && isset($_GET['done'])) left();

$now = time();
if (notify_valid_token($t)) {
  try {
    if ($post) {
      notify_list(function (array &$list) use ($t, $now) {
        $k = notify_by_token($list, $t);
        if ($k !== null) $list['subs'][$k] = notify_tombstone($list['subs'][$k], $now);
      }, true);
      if ($oneClick) { http_response_code(200); header('Content-Type: text/plain; charset=utf-8'); header('Cache-Control: no-store'); echo "unsubscribed\n"; exit; }
      header('Location: unsubscribe.php?done=1', true, 303);
      exit;
    }
    $e = notify_list(function (array &$list) use ($t) {
      $k = notify_by_token($list, $t);
      return $k === null ? null : $list['subs'][$k];
    });
  } catch (Throwable $x) {
    notify_error_log('unsubscribe: ' . $x->getMessage());
    notify_page(500, 'Something broke', 'The machine jammed.', '<p>Please try again in a minute, or write to <a href="mailto:support@boomachine.app">support@boomachine.app</a> and I will take you off the list by hand.</p>');
  }
  if (is_array($e) && !notify_expired($e, $now)) {
    notify_page(200, 'Leave the list', 'Leave the list?',
      '<p>One press, and your address is deleted. No more mails about the launch or new discs.</p>'
      . '<form method="post" action="unsubscribe.php"><input type="hidden" name="t" value="' . $t . '">'
      . '<button type="submit">Unsubscribe</button></form>');
  }
}
if ($oneClick) { http_response_code(200); header('Content-Type: text/plain; charset=utf-8'); echo "unsubscribed\n"; exit; }
notify_page(410, 'Link expired', 'The link went cold.',
  '<p>This link has expired or was already used.</p>'
  . '<p class="small">If mails still reach you, write to <a href="mailto:support@boomachine.app">support@boomachine.app</a> and I will take you off the list by hand.</p>');
