# Generated assets — V2 "masthead"

**Nothing was generated for this draft. No model was run, no cost incurred.**

Stage 2 was briefed to use only the stage-1 assets plus the app's own disc art and fonts,
and it does. Every prompt, model, seed and cost for the imagery on this page lives in
`../a2-assets/prompts.md` (fal.ai `nano-banana-pro`, twelve renders, three picks).

## What this folder uses, and where each file came from

| in `assets/` | source | role on the page |
|---|---|---|
| `hand-vampire.webp`, `hand-wolf.webp`, `hand-witch.webp` | `../a2-assets/` | the hand layer, with its own disc masked out |
| `fingers-vampire.webp`, `fingers-wolf.webp`, `fingers-witch.webp` | `../a2-assets/` | the parts of each hand that cross the disc face, stacked above the art |
| `disc-mask-vampire.png`, `disc-mask-wolf.png`, `disc-mask-witch.png` | `../a2-assets/` | knock the rendered silver disc out of each hand layer |
| `disc-blank.webp` | `../a2-assets/` | the silver base — used **twice**, once under the art and once back over it |
| `iridescence.webp` | `../a2-assets/` | the rainbow diffraction band, rotated by the pointer |
| `disc-starter.webp`, `disc-creatures.webp`, `disc-coven.webp` | the app's `NetherPlayer/Resources/SoundPacks/{Starter,Creatures,Coven}/disc.jpg`, already converted to 940² webp in `../a-the-hand/assets/` | the printed labels: Haunted house, Creature feature, The coven |
| `icon.webp` | the app icon, via `../a-the-hand/assets/` | favicon |

Geometry for placing the hands around the pinned disc comes from
`../a2-assets/geometry.json` (see README for the three CSS constants it produces).

## Fonts

`fonts/Barlow-Medium.woff2` and `fonts/Jacquard12-Regular.woff2` are the app's own bundled
faces, converted in an earlier draft; the SIL OFL 1.1 texts ship next to them as
`OFL-Barlow.txt` and `OFL-Jacquard12.txt`.
