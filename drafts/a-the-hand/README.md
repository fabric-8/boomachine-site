# a-the-hand — Boo Machine landing page draft

## The direction

One full-viewport scene, lit like a product shot: a hand holds one of the app's discs up to the
camera out of near-black, and the page is built around that single object. The hand changes —
mummy, werewolf, witch — and the disc it holds changes with it, so the hero itself tells you there
are three discs before the headline does.

## What to look at

1. **`shot-1440.png` / `shot-375.png`** — the hero at both widths. `*-section.png` are the
   supporting row.
2. **The disc is real.** The hands were generated holding a *blank black* disc. The actual
   `disc.jpg` art from the app is a separate CSS layer sitting on the generated disc, with the
   fingers that cross the disc face cut back out and stacked on top — so the werewolf's claws and
   the mummy's fingertips still hold the disc, and the art sits under them. A third layer multiplies
   each photo's own shading (key light + the shadows the fingers cast) over the art so it reads as a
   lit object rather than a screen.
3. **Cycling.** The hand changes every 6.5 s, or on click anywhere on the hero object, or from the
   three spindle dots in the LCD plate. 1 s crossfade; the incoming disc rotates a few degrees into
   place. The LCD reads out `Disc n / 3` + the disc name.
4. **Pointer tilt.** Moving the pointer tilts the whole plate slightly and drifts the disc art a few
   px more than the hand — a parallax depth cue, not a gimmick. Off under reduced motion, together
   with the cycling and the headline wipe.
5. **The CTA is a hardware key.** `PadSkinF` face in a black well, bevel, smoked red lamp lens that
   lights on hover, and a real press-down on `:active` (the key drops, the well shadow closes, the
   lamp goes bright). Same lamp language as the app's Repeat/Stop indicator; the rail carries a
   "Beta open" lamp.

## Type and colour

Jacquard 12 for the headline, the wordmark and the "Free" tag; Barlow Medium for everything else,
1.8 tracking on the small caps labels, exactly as the app sets them. Colours are Theme.swift values
(paper `#EEE8DF`, muted `#A19A94`, bronze `#B39A78`, amber phosphor, lcdRed `#F90000`) on pure
black, because the hero photography is pure black.

**Jacquard 12 has no usable capital T** — its blackletter T reads as a U at any size ("Uhree",
"Uap.", "Uhe coven"). So: no Jacquard string on this page contains a capital T. The headline is
"A cursed disc player / for your iPhone."; "Tap. Layer. Repeat." is set in Barlow caps with .14em
tracking; the LCD disc names are Barlow caps in amber, which is the app's own second LCD style
(`REPEAT / 3 SOUNDS`). Worth knowing for the app too, where the LCD renders "The coven" in
Jacquard.

## Alignment note (asked for in the brief)

Alignment turned out to be practical, not best-effort. The three renders were measured (circle fit
on the disc edge by ray-casting from the centre), then each frame was rescaled and re-cropped onto a
common 1400×1750 canvas where the disc centre is at 50% / 38% and its radius is 35% of the frame
width. So the page uses **one** overlay geometry for all three hands, and it holds at every viewport
because the frame keeps its aspect ratio. The art circle is 96% of the disc, leaving the generated
disc's black rim and its specular edge visible around it.

## Known gaps / open questions

- The hero is one PNG-derived composite per character: ~1.2 MB of WebP for all three sets. First
  paint only needs the mummy set; the other two are `loading="lazy"`. If that's too heavy, drop to
  two hands or to 1100 px frames.
- `assets/og.jpg` (1200×630) is composited from the witch frame with the wordmark and the claim, and
  wired up as `og:image` / `twitter:image`. The meta tags use a relative path — swap in the absolute
  https URL at deploy, since most scrapers require it.
- No `<picture>`/AVIF fallbacks.
- `support.html`, `privacy.html` and `press/` are linked but not in this draft folder.
- Copy is mine: the Jacquard line states the product, "Three discs. Thirty-six strange sounds."
  carries the numbers in Barlow underneath, and "Tap. Layer. Repeat." titles the second section.
- The three step captures are crops of the real captures (rows 2–3 of the pad grid, the layered
  Repeat state, the Release-to-eject display). If you'd rather show whole screens, they need a
  device frame — full 1320×2868 screens at column width were far too tall.

## Run it

```
cd a-the-hand && python3 -m http.server 8814   # then open http://localhost:8814/
```

Fonts are self-hosted woff2 converted from the app's TTFs; the SIL OFL texts ship next to them in
`fonts/`. No CDN, no framework, no build step.
