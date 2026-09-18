# `d-disc-poster` — the disc poster

## The direction

A record-shop poster made out of the app's own parts: the three discs are the hero,
large circular objects turning slowly under a stretched display plate whose readout is
live HTML in amber phosphor. Beneath each disc is its twelve-track sleeve listing, with
a lit red lamp on the six sounds that play free and a lock on the rest — so the page
answers "what do I get" by showing the actual contents rather than describing them.

No generated photography. Nothing on the page is drawn UI or stock: the plate, the
patina, the pad skin, the spindle, the growth and the discs are the shipped assets, and
the one screenshot is a real capture.

## Look at

1. **`shot-1440.png`** — the masthead. The plate is the app's `DisplayPlate.png` with
   its baked readout surgically removed (see `prompts.md`); "Boo Machine" is Jacquard 12
   set in `#FFD077` with the LCDView glow values, over a dot-matrix red rule, with the
   status line in red at the foot of the glass exactly where the app puts "READY".
2. **`shot-1440-mid.png`** — the fan. Three 380 px discs on a shallow arc, almost
   touching, each with the real machined spindle at the centre. They turn once every
   58 / 71 / 64 seconds (deliberately out of phase), **pause on hover or keyboard focus**,
   and are static under `prefers-reduced-motion`. At 1440x900 the top third of all
   three discs sits inside the first viewport.
3. **The Join key** — hover it. It is `PadSkinD` 9-sliced into a wide Eject-shaped cap
   in a black well; the smoked lamp lens lights red and the underglow gutter comes on,
   and `:active` presses the cap down 3 px and darkens it, like the app's pads.
4. **`shot-375.png` / `shot-375-mid.png`** — on phones the fan unstacks into three
   sleeve rows (disc left, name and tracklist right). Between 560 and 900 px the
   tracklists split 01–06 / 07–12 in two columns.

## Checked

- 1440, 1280, 1024, 900, 768, 430, 375 and 320 px: no horizontal scroll at any of them.
- axe-core WCAG 2.1 A/AA: **0 violations** (the 16 "incomplete" contrast nodes are
  text over background images, which axe can't compute; bronze `#B39A78` and muted
  `#A19A94` measure 6.3:1 and 6.1:1 against the page).
- `prefers-reduced-motion: reduce` kills both the disc rotation and the phosphor flicker.
- Dark only, as intended; `body` has an explicit background.
- Total page weight ~890 KB including both fonts, self-hosted, no CDN, no JS.

Working screenshots from the review passes are in `shots/`.

## Known gaps / decisions for Fab

- **The plate is used at its native 2.4:1 aspect**, not stretched wider. Stretching it
  would have had to repeat the frame's grime along the top and bottom bands, which reads
  as a texture seam. Native aspect keeps it the app's actual part. If you want a wider
  masthead I'd re-author the plate in the app's renderer rather than tile this PNG.
- **Lock marks after review pass one:** disc one carries the per-row marks (a lit red
  lamp on the six free tracks, a muted lock on its six locked ones) so the legend has
  something to refer to; discs two and three carry one lock badge in the meta line
  ("DISC TWO - 12 SOUNDS - UNLOCK") and their rows are clean. On phones the badge drops
  to its own line without the separator dot.
- **The discs turn at a constant speed and pause only on hover** - no spin-up or
  wind-down, confirmed in review.
- `support.html`, `privacy.html` and `press/` are linked but not in this folder — this
  draft is the landing page only.
- Copy says "coming soon" throughout: "App Store 29 September", "One $3.99 unlock opens
  all 36 when the App Store version lands". Nothing claims background playback, export
  or Android.
