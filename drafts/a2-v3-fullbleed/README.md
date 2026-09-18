# A2 / V3 — "full bleed"

The page is the object. One near-black void, one hand holding one disc filling
the frame, and the type living on the image along the bottom edge in the 21 TSI
hierarchy: oversized headline lower-left, slide-to-unlock lower-right, wordmark
small top-left. Everything the earlier draft explained in words has been cut;
what is left is the hand, one line of copy, one control, and a bare footer.

**This is the variant that tests whether the app should appear at all** — there
is exactly one real capture below the fold with a one-line caption, and it is the
only place the software is visible.

Serve it: `python3 -m http.server 8733` in this folder → http://127.0.0.1:8733/

## What to look at

| file | what |
|---|---|
| `shot-1440.png` | 1440×900, vampire / Haunted house, pointer near centre |
| `shot-1440-wolf.png` | 1440×900, wolf / Creature feature |
| `shot-1440-witch.png` | 1440×900, witch / The coven |
| `shot-tilt.png` | 1440×900, wolf, pointer top-right — the ±4° tilt and the reflections swept over with it |
| `shot-375.png` | 375×812, vampire / Haunted house |

Then move the mouse across the hero and click the hand.

## Design decisions worth arguing about

**The headline is Barlow, not Jacquard.** Jacquard 12 appears once, as the
wordmark, and that is the whole blackletter budget. An oversized Jacquard
headline would have fought the disc art for the same attention and lost
legibility at 92 px. So the headline is Barlow Medium, three short lines,
line-height .9, tracking −.035em, with the last line — "a sound." — in the app's
amber phosphor. That amber is the only accent colour on the page.

**Copy.** Headline "Give your Halloween a sound." One line under it: "A cursed
disc player for iPhone. Beta open now · App Store coming soon." No date while we
are in beta — that also holds for the `description`, `og:` and `twitter:` meta.
No feature list, no sound count, no prices, no "available now".

**No indicator, no disc names.** Cycling is automatic every 7 s; a click or tap
anywhere on the hand advances it; the current disc's name is only in the stage's
`aria-label` for screen readers.

**One scroll marker.** A 1 px bronze hairline and a drifting dot, centred at the
bottom edge between headline and control, hidden below 900 px. It is there
because there genuinely is something below the fold. It is the only decoration.

## The disc

The whole rig lives inside `.plate`, positioned from `geometry.json`. No wrapper
element sits between the layers, because a wrapper with a transform would create
a stacking context and the blend modes would stop seeing the photograph
underneath.

Layer stack, bottom to top:

1. `hand-<name>.webp` — the photograph, including its real silver disc, its
   specular, its rainbow, its clear inner ring, hub and spindle hole.
2. `.art` — the pack's `disc.jpg`, **normal** blend, masked by a radial gradient
   to the annulus 22.4 %–89.2 % of the radius, so the photograph's own clear ring,
   hub and outer rim band stay visible. This is the label.
3. `.gloss` — the *same photograph again*, aligned pixel-for-pixel by background
   position, clipped to the same annulus, `mix-blend-mode: overlay` at .82. This
   is the move that makes it read as a disc: overlay uses the ink underneath to
   decide, so the silver's shading multiplies the dark parts of the art and
   screens the bright parts. The specular, the shading and the diffraction
   modulate the label instead of fogging it.
4. `.iris` — `iridescence.webp`, screen at .19, rotating with the pointer.
5. `.spec` — a linear specular streak, screen at .32, sliding with the pointer.
6. `fingers-<name>.webp` — the claws and fingers that cross the disc face.

Things that were tried and rejected on screen:

- **`multiply` for the label.** Physically right for ink on a mirror, and it
  looked right on Haunted house, but all three disc arts have a mean luminance of
  about 21/255. Multiplied into the silver and screened back they went milky
  grey and the artwork vanished. Overlay keeps the art and still carries the
  metal.
- **Re-screening a crushed copy of the photograph for the highlights.** It fogged
  the dark half of every disc.
- **`disc-blank.webp` as the silver base.** Unnecessary — the photograph's own
  disc is already lit by the same key light as the hand, so it matches for free
  and there is no seam at the rim.

**The conic texture has a hard seam** at its 0° edge, which showed as a straight
line across every disc. `filter: blur(9px)` on the `.iris` layer removes it and
costs nothing, because the texture is a smooth gradient anyway.

## Holding the disc still

Every hand's disc is pinned to one screen point, `--Tx` / `--Ty`, at one radius,
`--tr`. Each plate derives its own box width from the measured ellipse
(`--Wb: calc(var(--tr) / var(--rx))`) and translates itself so its disc centre
lands on the pin. The hands therefore change size and position around a disc that
does not move, which is what makes the crossfade read as "the same disc, a
different hand".

`--tr` is `min(31.5 % of the viewport height, 45.5 % of its width)`, capped at
292 px. The pin sits at **54 % across, 40 % down** on desktop: off-centre to the
right so the headline's first two lines get clean black, and measured rather than
eyeballed — with the hero-foot hidden, the nearest lit pixel of the hand is 139 px
from the end of "Give your", 122 px from "Halloween" and 267 px from "a sound."
Below 900 px it recentres to 50 % / 35.5 %, where the type stacks underneath
instead of beside. `--vw` / `--vh` are written by a `ResizeObserver` on the hero
rather than taken from `vw` units, so the desktop scrollbar does not shift the
composition.

## Slide to unlock

A 340 px well (case patina, inset bevel, bronze hairline) with a charcoal
hardware key for a knob: `PadSkinC` texture, a red lamp top-right that is nearly
black at rest and lights with a glow on hover, focus and drag, and an amber gutter
that grows behind the knob as it travels. The 13 px label is centred in the track
*after* the knob rather than pinned to the right edge, so the two read as one
object; it shimmers on a slow bronze-to-amber sweep that speeds up on hover. The
label never clips — measured at 1440, 1024, 768, 414, 375 and 320 px, with a
smaller size and tighter tracking below 420 px where the control goes
gutter-to-gutter.

- Drag the knob past 60 % of the track → opens TestFlight.
- A plain click → opens TestFlight (the drag suppresses the click so it cannot
  fire twice).
- Tab to it and press Enter → opens TestFlight. It is a real `<a href>`.
- **An `<a>` is natively draggable**, and starting a mouse drag on one fires
  `pointercancel`, which killed the slide entirely. `draggable="false"`,
  `-webkit-user-drag: none` and a `dragstart` preventDefault fix it. Worth
  remembering for the other two variants.

## Reduced motion

`prefers-reduced-motion: reduce` turns everything off: no auto-cycle, no tilt, no
parallax, no shimmer, no drifting dot, no transitions. Click and Enter still
advance the disc, because that is the visitor asking. Verified in the browser
with the media feature forced on — after 8 s the first hand was still on screen.

## Reviewed

Screenshot → fix → re-screenshot, at 1440×900, 375×812, and 768×1024, 1024×768,
1280×800, 414×896, 320×690, 1920×1080 for overflow. `scrollWidth === clientWidth`
at every one of them. What that pass caught and fixed:

- the label read as a flat sticker (→ the overlay gloss pass above);
- the wolf and coven discs were washed to blank silver (same fix);
- a hard horizontal edge across the hero at 64 % height — the bottom scrim's
  second layer was a left-to-right gradient with no vertical falloff (→ a radial
  anchored at the bottom-left corner);
- the iridescence seam;
- `.glow` was used both for the amber word in the headline and for the slider's
  lit gutter, so the headline span was being absolutely positioned (→ `.gutter`);
- the footer's fine print sat on the copyright's line instead of its own
  (flex-shrink beat `flex-basis: 100 %`; the footer is a grid now);
- the second half of the lede was left alone on a third line at 375 px;
- the app capture and its caption floated in the middle of an empty row (→ they
  bottom-align in a narrow left column now).

Second pass, after review:

- the date came out of the copy and the meta;
- the disc moved 4 % right and 3 % up so the headline clears the vampire's
  fingers (measured, above);
- the slider label moved next to the knob and went up to 13 px, and the lamp got
  properly dim at rest;
- "· App Store coming soon." kept breaking badly at 375 px — the separator is
  bound with `&nbsp;` on both sides and the mobile lede is 42ch, so it now sets as
  two clean lines.

## Known gaps / open questions for Fab

1. **The witch stays cropped**, per your call — the pinch and the sleeve
   descending from the top edge. Her knuckles and warts are above the viewport;
   the only way to get them back is a disc about 30 % smaller for all three hands,
   which stops the page being full bleed.
2. **The app capture stays** below the fold, per your call.
3. The hero preloads one hand (352 KB); the other two are lazy. All three are
   ~1.1 MB. No AVIF fallbacks.
4. The footer links point at `support.html`, `privacy.html` and `press/`, which
   do not exist in this folder.
5. The disc art still ends at 89.2 % of the radius. Real CD labels stop a little
   further in; going tighter showed more of the photograph's rim than looked good
   on the witch.
