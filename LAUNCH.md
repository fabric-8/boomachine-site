# Launch day: prelaunch → live

(Internal. This file is in the repo but not deployed: the workflow excludes it from boomachine.app.)

The landing page runs in one of two modes, set at the top of `index.html` (first `<script>` in `<head>`):

- `prelaunch` (now): "Coming soon to the App Store". The hero control is the email form (notify.js → `subscribe.php`), the floating bar says **Get notified**.
- `live`: the hero is "slide to get the app" and the bar says **Get the app**. Both go to the App Store.

Preview either mode without a deploy: `?mode=live` or `?mode=prelaunch`.

## The switch

1. In `index.html`, `<head>`:
   - `window.BOO_MODE = "live";`
   - `window.APP_STORE_URL = "https://apps.apple.com/app/id<APPLE_ID>";` (the numeric Apple ID from App Store Connect → App Information). Remove the TODO comment above it.
2. Same file, the three static descriptions (crawlers and link previews read these without JS):
   - `<meta name="description" content="A spooky Halloween soundboard for iPhone, built as a cursed disc player. Tap creepy sounds, loop the room, change the disc. Free on the App Store.">`
   - `<meta property="og:description" content="A cursed disc player for your iPhone: tap spooky sounds, loop the room, change the disc. Free on the App Store.">`
   - `<meta name="twitter:description" content="A cursed disc player for your iPhone: tap spooky sounds, loop the room, change the disc. Free on the App Store.">`
   - The structured data (`<script type="application/ld+json">`, the `MobileApplication` node): add the store link and the free offer, and update the comment above it. Nothing else: no `aggregateRating` or `review` until real App Store ratings exist, and never invented ones.
     ```
     "downloadUrl": "https://apps.apple.com/app/id<APPLE_ID>",
     "offers": { "@type": "Offer", "price": "0", "priceCurrency": "USD" },
     ```
   - `sitemap.xml`: set `<lastmod>` of `https://boomachine.app/` to the launch date.
3. Open the page without `?mode`, slide the knob and tap the bar's button: both must land on the Boo Machine App Store page (desktop and phone).
4. Commit and push `site/`. Production deployment is manual: run `gh workflow run deploy-allinkl.yml -R fabric-8/boomachine-site`, wait for the workflow to pass, then verify boomachine.app. A push alone does not deploy to ALL-INKL.

## After the switch

- In live mode the email form is not on the page. `subscribe.php` and the list it holds are untouched.
- Analytics: `store_click` (s = slide | bar | link) replaces `notify_submit` as the conversion event.
- `legal.html` still describes the "Join the beta" link and the email list. Update that text when the notice changes (then also its `<lastmod>` in `sitemap.xml`).
- Search: check the page in Google's Rich Results Test (https://search.google.com/test/rich-results?url=https://boomachine.app/), then in Search Console run URL Inspection on `https://boomachine.app/` → Request indexing, so the live wording replaces "Coming soon" in results.
