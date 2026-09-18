# Generated assets — c-blur-and-blackletter

Model: `fal-ai/nano-banana-pro`, 2K, 16:9, jpeg, 1 image per call.
Pricing checked before running: **$0.15 / image** (nano-banana-2 would be $0.08).
**3 images generated = $0.45.** One is shipped, one is kept as an alternate, one was dropped.

All three used the same recipe: an out-of-focus 35 mm night photograph, near-monochrome
oxblood/crimson on near-black, heavy grain, deep vignette, empty negative space in the
lower left for the headline, subject in the upper/right third.

The page does **not** rely on the generated file's colour: the image is pushed to
`grayscale(1)` in CSS and re-tinted with a red `multiply` gradient, so it lands on the
LCD red (#F90000 / #FF2600) regardless of how a regenerated file comes out. Regenerate
freely; only the composition matters.

---

## 1. `assets/hero-hill.jpg` — SHIPPED (seed 58803)

> An out-of-focus night photograph looking up a bare hill at a lone abandoned farmhouse on
> the crest, bare crooked trees beside it, taken from far below. Shot on 35mm film, lens
> deliberately racked out of focus so nothing is sharp: the house and trees are soft masses of
> tone, one window a faint smear of warm light. The house sits high and slightly right of
> centre; the bottom half of the frame is empty dark hillside, reserved as negative space.
> Near-monochrome: deep oxblood and dark crimson red on near-black only, like a single-colour
> darkroom print or an old red LCD backlight, no greens, no blues. Heavy film grain, halation
> around the single light, strong vignette, very low key with almost no midtones. Lonely,
> dread-filled, quiet. No people, no text, no lettering, no watermark, no border.

Chosen because the hill runs as a diagonal across the frame, the single lit window lands
right of centre where the eye goes when the blur resolves, and the whole lower left is
empty — which is where the headline sits.

## 2. `assets/hero-house-alt.jpg` — ALTERNATE (seed 31021)

> An out-of-focus night photograph of a derelict Victorian house standing alone on a bare hill,
> shot on 35mm film with a fast lens wide open and deliberately racked out of focus so the whole
> frame is a soft bloom of shapes: the gabled roofline, a crooked chimney and two faintly glowing
> windows are only just readable. The house sits in the upper right third of the frame; the lower
> left is empty dark hillside and sky, almost featureless, reserved as negative space.
> Near-monochrome: everything rendered in deep oxblood and dark crimson reds on near-black, like a
> single-colour darkroom print or an old LCD backlight, no greens, no blues, no skin tones. Heavy
> silver-halide grain, halation blooming around the two lit windows, deep vignetting into the
> corners, very low overall brightness with only two or three small highlights. Bleak, cold, quiet.
> No people, no text, no lettering, no watermark, no border.

Closer and more gothic; two lit windows instead of one. Swap in by changing the `src` on
`.hero__bg img` — no other change needed.

## 3. Figure in a field (seed 77412) — NOT SHIPPED

> An out-of-focus night photograph of a single tall figure in a long coat standing far away in a
> field of dry grass, seen from behind, motionless, facing a distant treeline. […] The figure
> stands in the right third of the frame; the entire lower left is empty dark field […]

Good image, but a human figure competes with the phone capture that rises in the same
place. Regenerate from this prompt if you'd rather have a person than a house.

---

## Not generated

Everything else on the page is a real project asset, not a render:

| File | Source |
|---|---|
| `assets/key-A…F.jpg` | `docs/art-source/PadSkinA…F.png`, centre-cropped to the moving key face (the outer casing is rebuilt in CSS) |
| `assets/player.jpg` | `docs/screenshots/store-2026-09-18/raw/02-repeat-wind-whisper-knock.png` |
| `assets/player-eject.jpg` | `docs/screenshots/store-2026-09-18/raw/05-release-to-eject.png` |
| `assets/icon.png` | `AppIcon-1024.png` |
| `fonts/*.woff2` | `NetherPlayer/Resources/Fonts/*.ttf`, converted with fontTools (OFL text shipped alongside) |

The grain over the hero is an inline SVG `feTurbulence`, not a file.
