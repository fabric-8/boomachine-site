# Launch day: prelaunch → live

(Internal. This file is in the repo but not deployed: the workflow excludes it from boomachine.app.)

The landing page runs in one of two modes, set at the top of `index.html` (first `<script>` in `<head>`):

- `prelaunch` (now): "Coming soon to the App Store". The hero control is the email form (notify.js → `subscribe.php`), the floating bar says **Get notified**.
- `live`: the hero is "slide to get the app" and the bar says **Get the app**. Both go to the App Store.

Preview either mode without a deploy: `?mode=live` or `?mode=prelaunch`.

## Prepared: branch `launch-switch`

Steps 1 and 2 below are already made on the local branch `launch-switch` (including the JSON-LD `offers` and `downloadUrl`; not the sitemap `<lastmod>`, which needs the launch date), with the placeholder `__STORE_URL__` where the App Store link goes (`APP_STORE_URL` and the JSON-LD `downloadUrl`). On launch day: `git switch launch-switch && git rebase origin/main`, then `scripts/apply-store-url.sh https://apps.apple.com/app/id<APPLE_ID>` (it wants HTTP 200 from Apple, which answers 404 until the version is released, and fails if a placeholder is left), then steps 3 and 4. Full checklist: `app/docs/marketing/halloween-2026/launch-switch/README.md`.

Campaign links: next to `APP_STORE_URL` the branch sets `window.APP_STORE_PT` (Fab's App Store Connect provider ID, 111946749). The slider, the bar and any `<a data-store-link>` then link to their own Apple campaign link (`ct=site-slide`, `site-bar`, `site-link`; `app/docs/marketing/halloween-2026/CAMPAIGN_LINKS.csv`), so App Store Connect → Analytics → Acquisition → Campaigns counts installs per control. Give the apply script the plain store URL; it refuses one that already has `pt`/`ct`. After release, compare the first link App Store Connect's campaign generator produces with ours (`pt`); if it differs, `set-campaign-pt.sh <pt>` in that folder fixes it everywhere.

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
