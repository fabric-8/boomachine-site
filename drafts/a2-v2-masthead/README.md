# A2 · V2 "masthead"

**The direction.** The page is the machine's own display: "Boo Machine" set large and
centred in Jacquard 12, lit as amber phosphor, with the hand and the disc rising out of
the dark underneath it and ghosting across the letters. Everything else is one line, one
control and a bare footer — the first impact is the hand holding a real disc.

**Why amber, not paper white.** Jacquard 12 *is* an LCD blackletter, and the app's own
display lettering is amber/orange phosphor (Theme.swift, the icon). Paper white at this
size reads as any dark landing page with a big serif; amber makes the masthead read as
the machine powering on, which is also why it flickers once on load and carries a 1px
scanline grid. The glow is kept faint (three shadow stops, none above 34% alpha) so it
stays typography rather than neon.

## What to look at

| file | |
|---|---|
| `shot-1440.png` | 1440×900, disc 1 — vampire / Haunted house |
| `shot-1440-wolf.png` | 1440×900, disc 2 — wolf / Creature feature |
| `shot-1440-witch.png` | 1440×900, disc 3 — witch / The coven |
| `shot-375.png` | 375×812 |
| `shot-tilt.png` | 1440×900, wolf, pointer far to the lower right — the rig is tilted, the rainbow band has rotated and the specular has swept across |

In all three 1440 frames the disc sits at exactly the same place; only the hand and the
printed label change.

Serve it with `python3 -m http.server 8742` in this folder (`file://` will not load the
masks or the fonts).

## The disc

The disc is a real object built in layers inside one circle, and it is **pinned to one
screen point**: `--Tr` (disc radius) and `--disc-y` are the only two numbers, and every
hand is placed *around* the disc from the measured ellipse in `a2-assets/geometry.json`:

```
.l-vampire{width:calc(var(--Tr)*3.5804);left:calc(var(--Tr)*-1.7584);top:calc(var(--Tr)*-1.63325)}
.l-wolf   {width:calc(var(--Tr)*3.6245);left:calc(var(--Tr)*-1.73106);top:calc(var(--Tr)*-1.77650)}
.l-witch  {width:calc(var(--Tr)*3.0359);left:calc(var(--Tr)*-1.27812);top:calc(var(--Tr)*-2.35266)}
```

Those constants are `100/rx_pct`, `cx_pct·W`, `cy_pct·1.25·W` from geometry.json, so the
disc never moves by a pixel across the crossfade — the hands change around it.

Layer stack, bottom to top:

1. `hand-<name>.webp`, with **its own silver disc cut out** by `disc-mask-<name>.png`
   (`mask-image: <mask>, linear-gradient(#000,#000); mask-composite: exclude`). That is
   what the masks are for here: without the knockout you get two discs fighting at the
   rim; with it, the nails and claws that overhang the rim stay in the hand layer and
   still read. Verified by hiding the disc — the hole is clean.
2. `disc-blank.webp` — the silver base, sized so its 780/800 disc radius lands exactly on
   `--Tr`, `clip-path: circle(48.75%)`.
3. the disc art printed as an annulus from 25.4% to 90% of the face — it stops short of
   the rim and stops at the hub, like a real label. **Normal blend**, saturate 1.16,
   contrast 1.04: the ink keeps the colour the app's `disc.jpg` has.
4. **`disc-blank.webp` again**, `soft-light` at 62% plus an `overlay` pass at 26%, masked
   to the same annulus. This is what makes it a disc rather than a sticker: the metal's
   own radial brushing and diffraction come back *over* the print, in the highlights,
   without touching the hue.
5. lacquer sweep (`overlay`), iridescence conic texture (`color-dodge` 30%, rotates with
   the pointer), specular streak (`screen`, translates with the pointer), key-light
   soft-light pass keyed to the upper-left light of the shoot.
6. printed-label edge, clear inner ring, outer rim — hairlines. The silver reads clean in
   the clear band, the inner ring and the hub, which are outside the print annulus.
7. `fingers-<name>.webp` on top.

An earlier pass printed the art with `multiply` at saturate .72, which is what turned the
Haunted house sky brown and the werewolf grey-green. Step 3 is now a straight print and
step 4 does all the metal work.

The group tilts ±4° on `rotateX/rotateY` with `perspective:1400px`; the art parallaxes a
few px against the hand, the rainbow rotates up to ±46°, the specular sweeps ±42%. A
single rAF lerps toward the pointer and, after 2.2 s with no pointer, drifts on a slow
lissajous — so touch devices get the idle sway and the reflections never sit still.

Discs cycle every 7 s; a click or Enter/Space on the stage advances. Pairing is
vampire → Haunted house, wolf → Creature feature, witch → The coven.

## The disc against the title

The disc climbs into the masthead: its top edge covers the bottom **15%** of the
"Boo Machine" letters, in front of the title, with the amber bloom still spilling around
the disc's rim.

The stack threads the title through the rig, which is split into **three planes sharing
one tilt**:

```
p-hands   z1   the hand, at full strength
title     z2   "Boo Machine" printed across the fur and the skin
p-disc    z3   the disc, climbing in front of the title
p-fingers z4   the claws and nails that cross the disc face
```

So the wolf's claws and the witch's whole hand — knuckles, warts, black nails, the
thumb-and-index pinch on the rim — are at full opacity, with the masthead printed over
them. Nothing is ghosted. Earlier passes veiled the hands to protect the type; that
worked for the wolf's dark fur and erased the witch, whose hand is the one that carries
her character. The type is protected by the type instead: two tight dark stops
(`0 0 2px rgba(0,0,0,.9)`, `0 2px 4px rgba(0,0,0,.75)`) sit under the amber glow, and the
amber reads cleanly over her grey-green skin.

The only mask left on the hands plane is a bottom dissolve (`#000 0 78%` →
`transparent 100%`) so the arm does not collide with the control. The disc plane has no
mask at all.

The small Barlow line moved out of the masthead — with the disc that high it had nowhere
to sit — and now sits just above the control, over a soft black floor that also anchors
the control and stops either line ever landing on a pale hand. Under the control:
*Free on TestFlight · App Store coming soon*, 11px Barlow, no date and no price.

## Slide to unlock

A worn well with a bronze hairline and a noise patina, a hardware-key knob with a key
glyph, and a label that a shimmer runs across (1.8 s on hover instead of 3.6 s; the knob
nudges 9px). Drag past 72% and it opens the TestFlight link; release short and it springs
back; a plain click opens it too. Keyboard: it is an `<a>`, so Tab reaches it and Enter
opens it, and ArrowRight/ArrowLeft slide the knob a quarter at a time with the last
ArrowRight completing the unlock.

**An `<a>` is natively draggable**, and letting HTML drag-and-drop take the gesture fires
`pointercancel` and kills the slide. Three belts here: `setPointerCapture` on pointerdown,
`draggable="false"`, and `preventDefault` on `dragstart` (plus `-webkit-user-drag:none`).
Re-verified with real mouse input, counting `pointercancel` events on the knob:

- short drag to 162px → **0 pointercancel**, knob springs back, no navigation;
- full drag past the 72% threshold → **0 pointercancel**, knob at 306px, link followed;
- four ArrowRights with the knob focused → lands on
  `https://testflight.apple.com/join/jr1YqwtJ`.

## Checks run

- 1440×900 and 375×812, all three hands at both widths, plus two opposite tilt states.
- The disc's screen position is identical across all three hands (measured, not eyeballed).
- The title read over the witch's pale skin, zoomed in at 1:1.
- `prefers-reduced-motion: reduce` — no cycling, no tilt, no shimmer, no power-on
  flicker; the first disc is shown static. Screenshotted, confirmed.
- axe-core WCAG 2.1 A/AA: **0 violations**. The three "incomplete" items are
  gradient-clipped or shadowed text; measured by hand they are 11:1 (title), 7.8:1 (sub
  line) and 5.5:1 (unlock label) on black.
- No horizontal scroll at 375 (`scrollWidth == clientWidth == 375`), no page scroll at
  1440×900 — hero and footer fit one viewport.

## What was fixed during review

- The hand layers were being squashed: the `height="1750"` HTML attribute is a
  presentational hint, so with a CSS `width` the images rendered 663×1726 instead of
  663×829. `height:auto; aspect-ratio:1400/1750` fixed it. Everything about the geometry
  looked wrong until this was found.
- `img{max-width:100%}` against a zero-width rig collapsed every hand to 9px wide.
- The first pass dissolved the hands with black gradients painted *over* the stage. Since
  the stage sits above the masthead, that also painted out the title. Replaced with a mask
  on a rig wrapper.
- The disc covered the hand at 1.02× the measured radius, which ate the vampire's rim
  nails and the witch's pinch. Now 1.004×, with the mask knockout doing the real work.
- The art read as a flat sticker until the silver was laid back *over* the print
  (soft-light + overlay). That is the single biggest change. On review it had gone too far
  the other way — `multiply` plus saturate .72 drained the colour — so the print is now a
  normal-blend layer and the metal does the work above it.
- The printed label originally stopped at 87.4% of the face, leaving a clear band far
  wider than a real CD's. Now 90%.
- Footer text was #6F6A66 (3.9:1) and the mailto link had no non-colour affordance — both
  flagged by axe, both fixed.

## Known gaps / for Fab

- **The witch is cropped at the top of the frame, and that is geometric, not a choice.**
  Her hand sits 2.35 disc-radii above the disc centre (she dangles the disc from an arm
  that comes in from above), while the title overlap pins the disc centre at about 1.15
  radii from the top. At 1440×900 only the tips of her curled claws are cut. At 375 more
  of the back of her hand goes, and her forearm is also cropped by the right edge; the
  pinch, the claws and the knuckles still read. Keeping her whole hand in a 375 frame
  *and* the title overlap would force the disc down to about 157px across, which is not
  worth it. If the overlap ever became negotiable on phones, lowering `--disc-y` under
  the 520px query is a one-line change.
- `hand-*.webp` are 330–430 KB each and all three are in the markup; only the vampire is
  eager, the other two are `loading="lazy"`. Still ~1.1 MB of hands for a full cycle.
- The disc-blank's own soft edge leaves a faint grey halo where the rim crosses very dark
  fur (visible on the wolf, top-left). Tightening the clip to 48.4% kills it but also
  bites the rim highlight; left as is.
- Copy is two short lines around the control. If the upper one should be sentence case
  rather than the app's small-caps label style, it is one rule.
- The veil now reaches full opacity at 21% of the hero, so a hand crossing the very bottom
  of the letters is only lightly ghosted. Pushing that up ghosts the wolf's claws exactly
  where they grip the rim, which looked worse.
