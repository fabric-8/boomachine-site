# b-the-machine

**The direction.** The player itself is the hero: one real capture of the running app,
large and centred on a dark attic bench, tilted like an object someone set down, throwing
its own lamp light (red Repeat, violet and green pads) onto the wood. The headline does not
sit on the page — it sits *in* a display, an oversized version of the app's own LCD plate:
Jacquard 12 in amber phosphor on smoked glass, dot matrix and scanlines, with a slow
irregular flicker.

## Run it

```
cd b-the-machine && python3 -m http.server 8842
# http://127.0.0.1:8842/
```

## What to look at

- `shot-1440.png` — hero at 1440×900, two-column
- `shot-1280.png` — hero at 1280×800, two-column
- `shot-375.png` — hero at 375×812, stacked, CTA before the machine
- `shot-1440-mid.png` — the three discs and the free/unlock line
- Hover the **Join the iPhone beta** key: the arrow capsule swaps to the other side over
  0.5 s `cubic-bezier(0.16,0.64,0.32,1)`, the smoked red lamp lens lights, and a red
  underglow gutter comes up around the key in its well. Press it and the whole key
  depresses. That is the app's pad, not a web button.
- Hover a disc: it turns ~11°.
- Watch the hero for a minute: the shaft of light drifts across the beam on a 54 s cycle.

## Layout

- **≥1024 px** — two columns. Display plate and the hardware key (with its caption) stack
  in the left column, the machine stands in the right, vertically centred across both rows.
  The hero is `min-height: calc(100svh - 56px)`, so the scene fills the first screen and
  the whole CTA sits inside it: at 1440×900 the caption's baseline lands at y≈673, at
  1280×800 at y≈623. The machine grew with the space it gained — 622×303 at 1440×900,
  553×269 at 1280×800, against 420×205 in the stacked version.
- **<1024 px** — stacked: plate, key + caption, machine. On 375×812 the caption ends at
  y≈469, so the whole CTA is in the first screen and the machine follows underneath.

## How it's built

Static, one file. No framework, no CDN, no JS at all — every mechanic is CSS.
Fonts are self-hosted from the app bundle (woff2 + ttf fallback, OFL texts included).

- **Type:** Jacquard 12 for the display strip, section heads, disc names and the wordmark;
  Barlow Medium for everything else, uppercase at `.17em` tracking for labels.
- **Colour:** straight from `Theme.swift` — `#292724`, `#1E1E1E`, `#C4BFBA`, `#A19A94`,
  bronze `#B39A78`, `lcdRed #F90000`, `alert #FF2600` — plus the two values sampled off the
  real display: phosphor `#FFDD84` on glass `#170E04`.
- **Motion:** one orchestrated load (headline lines wipe up under overflow masks, the
  machine rises, the CTA fades), then only hover states, the LCD flicker and the 54 s beam
  drift. Everything lives inside `@media (prefers-reduced-motion: no-preference)`, so
  reduced motion gets a completely static page — verified: 0 running animations, all
  elements at full opacity.

## Checked

1440×900, 1280×800, 1024×768, 1440×720 and 375×812 in headless Chromium.
`scrollWidth === innerWidth` at every width, no horizontal scroll.

Fixed in the first build: hero was 1100 px tall and pushed the CTA off-screen; the offer
heading broke one word per line; the mobile status line wrapped to four lines; the disc
spindle read as a ball bearing instead of a recessed hub; the CTA label sat off-centre
after the arrow swap and the lamp was hidden under the arrow capsule at rest; hero images
were shipping at 1× on retina.

Fixed in review pass one: the two-column hero above, the plate's vertical padding cut ~30 %,
the key moved above the machine on small screens, the drifting light shaft, and the
free/unlock line under the discs. The top of the scene was also darkened (veil ramp and
plate opacity) because the taller hero exposed more of the attic rafters than the
composition wanted.

## Known gaps / open questions

1. **One capture, one state.** The page shows the Haunted house disc with Repeat on and
   three pads lit. Cycling through `01`–`05` (or a short loop) would show Eject and the
   collection, but it adds weight and a second thing competing with the display strip.
2. **The free/unlock line repeats the offer section.** The line under the discs and the
   `What it costs` heading now say nearly the same thing 600 px apart. It works as a scan
   line followed by the detail, but if it reads as repetition, the offer heading is the
   one to change.
3. **Support / Privacy / Press kit** are relative links (`support.html`, `privacy.html`,
   `press/`) — they resolve on the live site, not inside this draft folder.
4. **Mobile puts the machine below the fold.** The CTA-first order was the instruction and
   it is the right call for conversion, but on 375 the hero object is now something you
   scroll to rather than land on.
