# a2-v1-split — direction A, iteration 2, variant V1 "split"

**The direction.** One screen, split down the middle: the headline holds the
left, a cursed hand holding a real optical disc holds the right, and nothing
else is allowed in. The disc — not a logo, not a screenshot — is the whole
argument, so it was built to behave like a pressed CD: art printed as ink,
metal grain reading through it, a rainbow band and a specular streak that sweep
when you move the pointer, and the hands changing around a disc that never moves.

## What to look at

| file | what it is |
|---|---|
| `shot-1440.png` | 1440×900, vampire hand — Haunted house |
| `shot-1440-wolf.png` | 1440×900, wolf — Creature feature |
| `shot-1440-witch.png` | 1440×900, witch — The coven. Same disc, same spot, three hands |
| `shot-375.png` | 375×812, exactly one screen tall, no horizontal scroll |
| `shot-tilt.png` | 1440×900, wolf, pointer hard to the bottom left, cursor hovering the unlock control — the specular streak has swept across the face, the disc is rotated ~6°, the knob has nudged and the lamp is at full |

Run it with `python3 -m http.server` in this folder. Things worth trying live:
move the pointer across the disc, click anywhere on the right half to advance
the hand, tab to the control, and drag the key.

## The disc

The whole page hangs off one number, `--d`, the disc diameter. Everything else
is derived from `../a2-assets/geometry.json`.

**Pinning.** Each hand layer is placed at the shared anchor with
`left/top: var(--anchor-x)/var(--anchor-y)` and then pulled back by its own
measured disc centre using a *percentage* translate — percentages in `translate()`
resolve against the element's own box, so `translate(-49.11%, -36.49%)` lands the
vampire's disc centre exactly on the anchor with no JavaScript and no resize
handler. The box width is `--d * 50 / rx_pct`, which makes the rendered disc
radius exactly `--d / 2` for every hand:

```
.l-vampire{width:calc(var(--d) * 1.7898);transform:translate(-49.11%,-36.49%)}
.l-wolf   {width:calc(var(--d) * 1.8123);transform:translate(-47.76%,-39.21%)}
.l-witch  {width:calc(var(--d) * 1.5179);transform:translate(-42.10%,-61.99%)}
```

The three hands are framed completely differently and the crossfade still holds
the disc dead still — which is the effect, not a workaround.

**The layer stack**, inside one circle with `isolation: isolate` so the blends
never touch the page:

1. `dl-base` — `disc-blank.webp`, the silver from the render, at 102.6% so the
   rendered disc edge meets the circle edge.
2. `art` — the pack art at 93%, masked to a label ring (26.5%–88.5% of the
   radius) so the clear inner ring, the stacking ring and the spindle hole are
   never printed over. Parallaxes ~5 px further than the hand.
3. `dl-sheen` — `disc-blank.webp` again, `mix-blend-mode: overlay` at 0.86,
   masked to the label ring only. **This is the load-bearing trick.** The first build printed
   the art with `multiply` as the brief suggested; on the dark Coven and
   Creatures art that collapsed to mud and then the screen layers washed it to
   milk. Ink first, metal over the ink, is both truer to how a disc is actually
   printed and the only version where all three arts survive.
4. `dl-gloss` — `disc-blank.webp` a third time, crushed with
   `brightness(.42) contrast(3.8)` so everything but the true speculars goes to
   black, then screened back over the ink. Overlay alone modulates the print;
   this is what puts actual metal highlights *on* it.
5. `dl-rainbow` — `iridescence.webp`, screen, carrying across the label at about
   a third strength and full over the clear band, rotating with the pointer angle.
6. `dl-band` — a conic diffraction band sweeping the outer half of the label and
   the rim at twice the pointer angle.
7. `dl-spec` — a linear specular streak, screen at 0.62, translating ~36 px with
   the pointer, i.e. much further than the hand. This is the one that reads as
   light moving, and it is the thing to look at in `shot-tilt.png`.
8. `dl-hub` — the spindle hole, stacking ring and clear polycarbonate collar,
   drawn rather than borrowed, because the render's own hub goes flat under the
   sheen.
9. `dl-rings` — the pressed rings at the label's inner and outer edge, plus two
   bright rings that state the clear band.
10. `fingers-*.webp` on top, with a key-light drop shadow so the claws sit *on*
   the disc.

**The circle is sized to the measured face (1.005×), not oversized.** An earlier
pass grew it to 1.05× to cover a rim crescent and that sliced the wolf's claws
into torn-paper shapes at the rim. Letting the render supply the physical rim,
the edge thickness and the shadow, and keeping the CSS disc to the printed face,
fixes the claws and reads more like a real object.

**Motion.** One rAF loop eases toward the pointer; with no pointer it drives a
slow two-frequency sway instead, so touch devices get the idle drift. The group
tilts ±6° with `perspective: 1200px`; the art, the rainbow and the streak each
move further than the hand, which is what makes it read as depth rather than a
sticker. Hands crossfade every 7 s; a click anywhere on the right half advances.

## Slide to unlock

`<a href>` to the TestFlight link, so Enter works and the accessible name comes
from `aria-label`. Track: a black well with an inset bevel, `PadSkinA` patina and
a scored channel for the key to run in. Knob: a worn charcoal key with a top
bevel, a dark bottom lip, a bronze chevron and a smoked red lamp lens that lights
on hover, focus and drag. Hover nudges the key 7 px and doubles the shimmer speed.
Dragging past 62% of the travel fires the link; short of it, the key springs back.
An `<a>` is natively draggable, which can fire `dragstart`/`pointercancel` and kill
the slide: this one carries `draggable="false"`, `-webkit-user-drag: none`,
`user-select: none`, a `dragstart` preventDefault **and** `setPointerCapture` on
pointerdown. Verified with a real mouse drag — see below.
An amber underglow gutter fills behind the key as it travels. The lamp lens is lit
dim at rest and goes to full on hover, focus and drag. Below 430 px the label
shortens to "slide to join the beta" so it can never clip.

## Type and palette

Jacquard 12 for the wordmark only (no capital T in "Boo Machine"); Barlow Medium
for everything else, one weight, with size, colour and tracking doing the
hierarchy. The headline is four short lines set at 104px/0.92 so the block is a
poster, not a sentence; its widest line (460 px at 1440) is tuned to the width of the
unlock control beneath it (478 px). The only colour that is not paper, bronze or charcoal is the
amber phosphor — the wordmark, the full stop, and the underglow — plus the one
red lamp. Palette values are straight out of `Theme.swift`.

## What I looked at, and what it changed

- **1440×900, first render.** `.say` had `max-width: 34ch`, which resolves against
  the *container's* 16 px font, not the headline's — the column was 272 px wide,
  the headline broke to five lines and the unlock label was cut mid-word. Fixed.
- **Disc close-ups, five passes.** Rainbow at 0.26 + a screen copy of the art
  turned the Haunted house neon; the hub read as a chrome donut, then as a flat
  grey bottle cap. Ended at: art as ink, overlay sheen, rainbow 0.2, band 0.26,
  specular 0.34, hub drawn by hand, label pulled in from 32% to 26.5% of the
  radius so the hub is CD-sized.
- **A red-outline overlay over the bare render** to check the pinning. The Hough
  fit sits ~3–5% inside the visible rim, which is what produced the crescent —
  see the note above on why the circle is 1.005× and not 1.05×.
- **All three hands, full page.** Confirmed the pairing (vampire → Haunted house,
  wolf → Creature feature, witch → The coven) and that the disc does not move a
  pixel across the crossfade.
- **Wolf close-up at 1.9× brightness.** Found the stage-1 matte's staircase edge
  where the fur was cut. 0.35 px of blur plus a key-light drop shadow on the
  fingers layer removes it and improves the occlusion read.
- **375×812.** The page was 833 px, 21 too tall, with dead air above the disc.
  Retuned the mobile stage to `--d * 1.46` with the anchor at 45%; now exactly
  812 and no horizontal scroll. Also 360 and 320: the unlock label was clipping
  at every width below 400, hence the short label.
- **Footer.** The maker line sat on the vampire's wrist. Added a gradient scrim
  under the footer rather than moving the hand.
- **axe-core: 0 violations.** The dim label, fineprint and maker line were all
  under 4.5:1 and were raised; the mailto link now carries an underline so it is
  not distinguished by colour alone.
- **prefers-reduced-motion.** Verified: no cycling, no sway, no shimmer, first
  hand only, tilt frozen at a fixed flattering angle (`--px: -0.3`).
- **The drag, end to end**, with `window.open` stubbed: the key travels, the
  gutter fills, the lamp lights and the TestFlight URL fires.

## Revision pass

- **The disc did not read as metal next to the v2 sibling.** Added `dl-gloss`
  (the crushed-highlights screen pass), took the overlay sheen from 0.58 to 0.86,
  the rainbow from 0.2 to 0.34 and pushed it across the label rather than only the
  rim, widened the diffraction band inward, took the specular streak from 0.34 to
  0.62 and its travel from 30 px to 36 px, and added two bright rings so the clear
  band and the rim are unambiguous.
- **That first pass then ate the art**, which is the thing it was not allowed to
  do. The three pack arts have mean luminance 22 / 22 / 16 out of 255 — they are
  *very* dark, so any additive layer wins by default. Two corrections: the
  additive layers came back down (gloss 0.64, rainbow 0.34, band 0.40, and the
  gloss mask halved over the label), and the ink got the density to fight back —
  `brightness(1.24)` on all three, `1.30` on Creature feature, `1.52` on The
  coven, which is the darkest by a quarter. All three now hold their colour with
  the metal fully present. Compare the three `shot-1440*.png`.
- **Tilt ±4° → ±6°.**
- **Control 15% larger**: 416×66 → 478×76, knob 70×54 → 80×62, label 11.5 → 13 px
  (12 px on narrow), chevron, lamp, gutter and channel all scaled with it. The
  headline went 94 → 104 px so its widest line still sits under the control.
  Mobile `--d` dropped 258 → 250 to give back the 10 px the taller control took;
  the page is still exactly 812.
- **The lamp now glows dim at rest** (0.62 opacity on a lit lens with a 6 px
  bloom) and goes to full on hover, focus and drag.
- **Micro-line** is now "TestFlight · App Store coming soon".
- **Native-drag check (flagged from a sibling variant).** My control was already
  calling `setPointerCapture` and preventing `dragstart`; I added
  `draggable="false"`, `-webkit-user-drag: none` and `user-select: none` anyway
  and re-verified with a real synthetic mouse drag. Event log for a full drag is
  `pointerdown > pointerup > click` — **no `dragstart`, no `pointercancel`** — the
  key travels the full 384 px and the TestFlight URL fires. A short drag
  (230 px, under the 62% threshold) opens nothing and springs back to 0. Enter on
  the focused control navigates. So the bug does not reproduce here.

## Known gaps / open questions for Fab

1. **The wordmark is a dead link** (`href="#"`). `support.html`, `privacy.html`
   and `press/` are relative paths that do not exist in this folder — they
   assume the real site's structure, so the footer links 404 locally.
2. **No `.webmanifest`, no OG image, no `support`/`privacy` pages.** This is a
   hero study, not a shippable site.
3. **"App Store coming soon" got one line under the control.** The brief said
   bare minimum, and I judged that the visitor needs to know the beta is not the
   finished thing. Cut it if you disagree — it is one `<p class="fineprint">`.
4. **The headline is the product statement, not the mood one.** "Give your
   Halloween a sound." would swap in cleanly; it is four `<span class="lede">`
   lines and one clamp.
5. **1.1 MB of hands.** Only the vampire is needed for first paint; the other two
   are `loading="lazy"` but they are still fetched early in practice. If this
   ships, the other two want to be fetched after load, or served as AVIF.
6. **The ink now carries a per-art brightness filter** (1.24 / 1.30 / 1.52) to
   survive the metal. That is a correction for these three source files, not a
   general rule — a fourth, brighter disc would want its own number, and if the
   pack art is ever re-exported brighter these should come back down. They are
   three `filter:` declarations on `.art` / `.a-wolf` / `.a-witch`.
7. **The bottom third of every disc is a silver sweep.** That is the metal doing
   its job and it moves with the pointer, but it does sit over the lower part of
   each illustration. If you would rather the art won there, the lever is
   `.dl-gloss` opacity.
