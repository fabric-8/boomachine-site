# Asset provenance — `d-disc-poster`

**No image model was run for this draft. Nothing was generated; no fal.ai spend.**

Every pixel on the page is an existing Boo Machine asset, re-cut for the web. The
build script that produced `assets/` is reproducible — it reads only from the app
repo and writes only into this folder.

Build: `python -m venv venv && venv/bin/pip install pillow fonttools brotli`, then the
two scripts described below (kept in the session scratchpad, reproduced here as recipes).

## assets/

| File | Source | What was done |
|---|---|---|
| `plate.webp` | `docs/art-source/DisplayPlate.png` (3001×1247) | The source has the app's readout ("Haunted house" / "READY") baked in, because it is a screenshot-derived plate. The glass interior (x 165–1890, y 172–1035) was rebuilt: a low-frequency vignette field sampled from text-free rows/columns, plus the real dot-matrix grid tiled from a clean 150×600 patch at x 1745 (a whole number of the measured 37.5 px pitch, so it repeats invisibly), feathered back into the untouched plate at the edges. The frame, screws, vent ridges, thumb knob and the growth on the left edge are original. Resized to 1800×748, WebP q88. The wordmark, the red rule and the two readout lines are live HTML on top. |
| `disc-haunted-house.webp`, `disc-creature-feature.webp`, `disc-coven.webp` | `NetherPlayer/Resources/SoundPacks/{Starter,Creatures,Coven}/disc.jpg` | Resized 1024² → 760², WebP q84. Cropped to a circle in CSS, as the app does. |
| `spindle.webp` | `docs/art-source/MachinedSpindle.png` | Resized to 700², circular alpha mask (4× supersampled edge) so it composites over the disc art instead of carrying its black square. |
| `case-patina.webp` | `docs/art-source/CasePatina.png` | Resized to 1024×1536, WebP q80. The page's fixed background material. |
| `growthroots.webp`, `growthcrown.webp` | `docs/art-source/GrowthRoots.png`, `GrowthCrown.png` | Resized with alpha preserved, WebP q88. Used twice on the whole page. |
| `pad-skin.webp` | `docs/art-source/PadSkinD.png` (the mostly-intact satin face) | Resized to 640², WebP q88. Drives the Join key as a CSS `border-image` 9-slice (`150 fill stretch`), so the bevel and the black gutter survive at any key width. |
| `capture-player.webp` | `docs/screenshots/store-2026-09-18/raw/01-heartbeat-playing.png` | Resized 1320 → 660 wide, WebP q82. A real capture — no UI is drawn on this page. |

Total assets: 776 KB.

## fonts/

`Barlow-Medium.ttf` and `Jacquard12-Regular.ttf` from `NetherPlayer/Resources/Fonts/`,
converted to woff2 with fontTools (38 KB and 29 KB). Both OFL 1.1 licence files are
shipped beside them, as required.

## Colour

Taken verbatim from the app, not sampled by eye:

- `NetherPlayer/Views/Theme.swift` — caseGray, trayGray, trayWell, lcdRed `#F90000`,
  alert `#FF2600`, rowText `#C4BFBA`, muted `#A19A94`, paper `#EEE8DF`, railText `#B39A78`.
- `NetherPlayer/Views/LCDView.swift` — the amber phosphor: lettering `#FFD077`,
  glow `#FF8A00`, inner glow `#FFB02E`, glass `#100A03`, red prompt `#FF4838`.
