# prompts.md — a2-v1-split

**No images were generated for this draft. Zero fal.ai spend.**

Every photographic asset here comes from the shared stage-1 set in
`../a2-assets/`, which was generated once for all three iteration-2 layouts.
The model, prompts, seeds, run breakdown and cost for those renders live in
`../a2-assets/prompts.md` — that is the authoritative record.

## What was copied in, and from where

| file in `assets/` | source | change |
|---|---|---|
| `hand-{vampire,wolf,witch}.webp` | `../a2-assets/` | verbatim |
| `fingers-{vampire,wolf,witch}.webp` | `../a2-assets/` | verbatim |
| `disc-blank.webp` | `../a2-assets/` | verbatim |
| `iridescence.webp` | `../a2-assets/` | verbatim (the 113 KB webp, not the 1.4 MB PNG master) |
| `geometry.json` | `../a2-assets/` | verbatim, shipped for reference; the numbers are inlined in the CSS |
| `art-vampire.webp` | app repo `NetherPlayer/Resources/SoundPacks/Starter/disc.jpg` | `cwebp -q 86 -resize 900 900` |
| `art-wolf.webp` | app repo `.../SoundPacks/Creatures/disc.jpg` | same |
| `art-witch.webp` | app repo `.../SoundPacks/Coven/disc.jpg` | same |
| `icon.webp` | app repo `Assets.xcassets/AppIcon.appiconset/AppIcon-1024.png` | `cwebp -q 82 -resize 256 256` |
| `padskin.webp` | app repo `docs/art-source/PadSkinA.png` | `cwebp -q 84 -resize 512 512` |

`disc-mask-*.png` was **not** needed: the disc is pinned to one on-screen circle
by the geometry transform, so a plain CSS circle does the clipping and the
per-hand alpha mask has nothing left to do.

Fonts are the app's own Barlow Medium and Jacquard 12, copied as woff2 from
`../a-the-hand/fonts/` with their OFL texts.

Nothing in the app repo or the site repo was modified — only read.
