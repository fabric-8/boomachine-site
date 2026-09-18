# c-blur-and-blackletter

**The direction.** The 21 TSI hero mechanic, tuned to the app: a sticky full-viewport hero
inside a taller section, where a heavily out-of-focus night photograph — pushed to
monochrome and re-tinted to the LCD's red — sharpens as you scroll while a real player
capture rises into the middle of it. The oversized Jacquard 12 headline sits lower left and
the "Join the iPhone beta" control is one of the app's own hardware keys, lower right,
where 21 TSI puts its scroll ring. Nothing on the page is drawn UI: every key face is a
real `PadSkin` texture and every screen is a real store capture.

## Look at

```
cd <this folder> && python3 -m http.server 8731
# then http://127.0.0.1:8731/
```

Scroll slowly through the first screen — the whole direction lives in that one transition.

| File | What it is |
|---|---|
| `shot-1440.png` | desktop, top of the hero (blurred state) |
| `shot-1440-resolved.png` | desktop, hero fully scrolled (capture landed, second beat faded in) |
| `shot-1440-alt.png` | same frame with the hill photo instead — the version that lost |
| `shot-1280-resolved.png` | 1280×800, resolved: the red caption and the key stay well clear |
| `shot-375.png` | phone, top of the hero |

## How the hero works

`#hero` is 280 vh tall (230 vh under 900 px) with a `position: sticky` 100 svh child. A
scroll listener writes four eased progress values onto it as custom properties, and CSS does
the rest — no library, no scroll-jacking, one `requestAnimationFrame` per scroll event.

| var | range | drives |
|---|---|---|
| `--p` | 0 → .72 | backdrop blur 21px → 4px, scale 1.16 → 1.03, opacity .86 → .44 |
| `--pA` | .10 → .52 | headline fades and lifts out |
| `--pB` | .16 → .78 | player capture rises from below and scales in |
| `--pC` | .48 → .88 | "Layer them. Loop them." fades in where the headline was |

A quiet "Scroll" cue — Barlow small caps over a 48 px hairline in LCD red — sits lower
centre and fades out on `--pA` squared, so it is gone well before the capture arrives. It is
hidden below 900 px (the full-width key already owns that space) and under reduced motion.

Under `prefers-reduced-motion` the listener pins every value and the CSS swaps to a single
static composition: headline lower left, capture top right, key lower right, no reveal.

## Details worth noticing

- **Which photograph.** Two were generated; the page ships the closer Victorian house
  (`hero-house-alt.jpg`) because its gabled roofline and two lit windows stay legible through
  14 px of blur at first paint. The hill shot (`hero-hill.jpg`) reads as an undifferentiated
  smear until it resolves — see `shot-1440-alt.png`. Swapping them back is a one-line `src`
  change, but the phone crop (`object-position`) is tuned per image.
- **The backdrop is not a pink photo.** The generated image is forced to `grayscale(1)` and
  tinted by a red `multiply` gradient inside an isolated stacking context, so it sits exactly
  on the LCD red no matter what a regenerated file looks like.
- **The key numbers are real.** The six free sounds are pads **1, 2, 5, 6, 7, 8** on the
  starter disc — their actual positions, not 01–06. The gaps are the locked pads, which is
  the whole point of the section.
- **Six keys, six skins.** Each pad in the grid uses a different `PadSkin` face (A–F), the
  same way the app distributes them, so no two keys wear the same damage.
- **The lamp.** Dark smoked lens by default; lights to `#FF2600` with an underglow in the
  well on hover and on keyboard focus, matching the app's lit gutter. The CTA key also ticks
  its lamp once on load, like hardware waking up.
- The CTA key depresses 4 px on `:active` with its drop shadow collapsing, the way the pads do.

## Known gaps / decisions to check

- **Blackletter `T` reads as `U`.** In Jacquard 12 at display sizes, a capital T is easily
  misread — "Tap. Layer. Repeat." rendered as "Uap." So the headings avoid initial T:
  the second beat is "Layer them. Loop them." and the unlock heading is "And the other
  thirty." If you're happy with the T, both can go back to the brief's wording.
- **The grid pads are not buttons.** They light on hover but do nothing; they're a picture of
  the hardware, so they're plain list items with no focus ring and no click target. If you
  want them to preview the actual sounds, that's a different build (six short audio files and
  a real play/stop state).
- `support.html`, `privacy.html` and `press/` are linked but not in this folder — the draft is
  the landing page only.
- The eject capture (`player-eject.jpg`) genuinely stops after pad 9; that's what the app
  shows while the disc is lifted, not a crop.
- Copy says "App Store · coming Sep 29" everywhere, never "available now".
- Fonts are self-hosted woff2 with both OFL texts in `fonts/`. No CDN, no third-party request.

## Checked

1440×900, 1280×800 and 375×812 — top / mid-scroll / resolved / sounds / unlock / footer, plus
the reduced-motion composition at both widths and the keyboard focus ring on the key. At 1280
the red "Wind · Whisper · Knock, on repeat" caption ends at x≈755 and the key starts at x≈995,
so they never meet; below 900 px the caption is hidden anyway. No horizontal scroll at 375
(`scrollWidth === 375`), nav stays one 58 px line, no console output, no page errors.

Page gutters step from 16 px to 34 px above 1000 px so 1280 and 1440 don't run flush to the
edge. The nav carries Sounds / The unlock / Support / Press kit; Press kit drops off below
560 px, where it would force a second nav line — the footer still carries it.
