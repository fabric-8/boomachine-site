# Generated assets — A2 / V3 "full bleed"

**Nothing was generated for this draft. $0.00 spent, no fal.ai calls.**

The brief for stage 2 says to use only the stage-1 assets plus the app's own
disc art and fonts, so every pixel here already existed:

| file in `assets/` | where it came from |
|---|---|
| `hand-{vampire,wolf,witch}.webp` | `site-drafts/a2-assets/` verbatim |
| `fingers-{vampire,wolf,witch}.webp` | `site-drafts/a2-assets/` verbatim |
| `iridescence.webp` | `site-drafts/a2-assets/` verbatim |
| `geometry.json` | `site-drafts/a2-assets/` verbatim (shipped so the rig is self-describing) |
| `disc-haunted-house.webp` | `NetherPlayer/Resources/SoundPacks/Starter/disc.jpg`, 1024² → 880², WebP q84 |
| `disc-creature-feature.webp` | `…/SoundPacks/Creatures/disc.jpg`, same treatment |
| `disc-the-coven.webp` | `…/SoundPacks/Coven/disc.jpg`, same treatment |
| `app-repeat.webp` | `docs/screenshots/store-2026-09-18/raw/02-repeat-wind-whisper-knock.png`, 1320×2868 → 460×999, WebP q86 |
| `padskin.webp` | `docs/art-source/PadSkinC.png` → 256², the knob face |
| `patina.webp` | `docs/art-source/CasePatina.png` → 640², the wear inside the slider well |
| `icon.webp` | `AppIcon-1024.png` → 96², favicon |
| `og.jpg` | a 1200×630 screenshot of this page's own hero |

The source files were read, never written. Nothing in either repo was touched.

The prompts, the model (`fal-ai/nano-banana-pro`), the twelve renders and the
$1.80 they cost are documented in `../a2-assets/prompts.md`.

`disc-blank.webp` and `disc-mask-*.png` from stage 1 are **not** used: the disc
in this draft is the silver disc in the photograph itself, and the label is
masked into it with a CSS radial gradient. See README.md.
