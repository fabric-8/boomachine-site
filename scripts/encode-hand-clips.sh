#!/usr/bin/env bash
# The phone layout's story figures (index.html .mfig, story.css / story.js
# "the phone layout"): the press kit's phone-in-hand clips, cropped to the
# hand and the phone and encoded for the web.
#
#   captures/<clip>-hand.mp4        H.264 High, yuv420p, BT.709 tv, +faststart, no audio
#   captures/<clip>-hand.webm       VP9 (CRF, 2-pass), same frame
#   captures/<clip>-hand-poster.webp  the first frame (the loop starts there)
#
# Sources: app/docs/marketing/halloween-2026/press-kit/video/
#   boo-machine-{tap,loop,disc}-in-hand.mp4 (1856 x 2320, 30 fps, silent;
#   how they were made: ../VIDEO.md there). tap = vampire, loop = werewolf,
#   disc = witch — the same pairs the desktop's sticky phone morphs through.
# The frame is cropped around the phone (centred on it, x 368..1488,
# y 240..2200: the phone at ~73 % of the width, the hands bleeding off both
# sides, the sleeves already fading to black at the foot) and scaled to
# 752 x 1316, ~1.9x a 390 px phone's css width. The background of the
# sources is black (Y 16 = #000 decoded), the page's own black; story.css
# feathers the figure's edges with a mask where it lies on the story's red
# pool.
#   scripts/encode-hand-clips.sh            (needs ffmpeg with libx264 +
#                                            libvpx-vp9, and cwebp)
set -euo pipefail

SRC="${SRC:-$HOME/work/f8/projects/boo-machine/app/docs/marketing/halloween-2026/press-kit/video}"
OUT="$(cd "$(dirname "$0")/.." && pwd)/captures"
W=752; H=1316
CROP="crop=1120:1960:368:240,scale=${W}:${H}:flags=lanczos"
TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT

for clip in tap loop disc; do
  in="$SRC/boo-machine-$clip-in-hand.mp4"
  [ -f "$in" ] || { echo "missing $in" >&2; exit 1; }
  ffmpeg -v error -y -i "$in" -an -vf "$CROP,format=yuv420p" \
    -c:v libx264 -profile:v high -preset veryslow -crf "${CRF_H264:-27}" -g 60 \
    -color_primaries bt709 -color_trc bt709 -colorspace bt709 -color_range tv \
    -movflags +faststart "$OUT/$clip-hand.mp4"
  ffmpeg -v error -y -i "$in" -an -vf "$CROP,format=yuv420p" \
    -c:v libvpx-vp9 -b:v 0 -crf "${CRF_VP9:-40}" -row-mt 1 -deadline good -cpu-used 1 -g 60 \
    -pass 1 -passlogfile "$TMP/$clip" -f webm /dev/null
  ffmpeg -v error -y -i "$in" -an -vf "$CROP,format=yuv420p" \
    -c:v libvpx-vp9 -b:v 0 -crf "${CRF_VP9:-40}" -row-mt 1 -deadline good -cpu-used 1 -g 60 \
    -color_primaries bt709 -color_trc bt709 -colorspace bt709 -color_range tv \
    -pass 2 -passlogfile "$TMP/$clip" "$OUT/$clip-hand.webm"
  ffmpeg -v error -y -i "$in" -frames:v 1 -vf "$CROP,scale=in_color_matrix=bt709:in_range=tv:out_range=pc,format=rgb24" "$TMP/$clip.png"
  cwebp -quiet -q 74 -m 6 "$TMP/$clip.png" -o "$OUT/$clip-hand-poster.webp"
  ls -l "$OUT/$clip-hand.mp4" "$OUT/$clip-hand.webm" "$OUT/$clip-hand-poster.webp" | awk '{print $5, $9}'
done
