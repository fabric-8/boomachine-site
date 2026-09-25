# Launch day: prelaunch → live

The landing page runs in one of two modes, set at the top of `index.html` (first `<script>` in `<head>`):

- `prelaunch` (now): "Coming soon to the App Store". The hero control is the email form (notify.js → `subscribe.php`), the floating bar says **Get notified**.
- `live`: the hero is "slide to get the app" and the bar says **Get the app**. Both go to the App Store.

Preview either mode without a deploy: `?mode=live` or `?mode=prelaunch`.

## The switch

1. In `index.html`, `<head>`:
   - `window.BOO_MODE = "live";`
   - `window.APP_STORE_URL = "https://apps.apple.com/app/id<APPLE_ID>";` (the numeric Apple ID from App Store Connect → App Information). Remove the TODO comment above it.
2. Same file, the two static descriptions (crawlers and link previews read these without JS):
   - `<meta name="description" content="Boo Machine is a Halloween soundboard for iPhone, built as a cursed disc player. Tap a creepy sound, loop the room, change the disc. Free on the App Store.">`
   - `<meta property="og:description" content="A cursed disc player for your iPhone. Free on the App Store.">`
3. Open the page without `?mode`, slide the knob and tap the bar's button: both must land on the Boo Machine App Store page (desktop and phone).
4. Commit and push `site/` (pushing publishes).

## After the switch

- In live mode the email form is not on the page. `subscribe.php` and the list it holds are untouched.
- Analytics: `store_click` (s = slide | bar | link) replaces `notify_submit` as the conversion event.
- `legal.html` still describes the "Join the beta" link and the email list. Update that text when the notice changes.
