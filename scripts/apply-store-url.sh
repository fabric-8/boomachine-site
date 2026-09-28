#!/usr/bin/env bash
# Launch day (LAUNCH.md): writes the real App Store link wherever the
# launch-switch branch left the placeholder __STORE_URL__, then checks that
# none is left and that the page is in live mode.
#
#   scripts/apply-store-url.sh https://apps.apple.com/app/id6812423821
#   scripts/apply-store-url.sh --no-check <url>   # skip the online check
#
# The online check asks apps.apple.com for the URL and wants HTTP 200. Until
# the version is released Apple answers 404 (checked 2026-09-28 for
# id6812423821), so a pass means the link really opens. Nothing is committed
# or pushed; review with `git diff`, then commit.
set -euo pipefail

PH="__STORE_URL__"
check=1
if [ "${1:-}" = "--no-check" ]; then check=0; shift; fi
url="${1:-}"
[ $# -eq 1 ] || { echo "usage: $0 [--no-check] https://apps.apple.com/..." >&2; exit 2; }

case "$url" in
  https://apps.apple.com/*) ;;
  *) echo "not an App Store URL (must start with https://apps.apple.com/): $url" >&2; exit 2 ;;
esac
case "$url" in
  *[[:space:]\"\'\<\>\\]*) echo "the URL contains a space, quote, <, > or backslash: $url" >&2; exit 2 ;;
esac
case "$url" in *id000000000*|*"$PH"*) echo "that is the placeholder, not the real link" >&2; exit 2 ;; esac

cd "$(dirname "$0")/.."

if [ "$check" = 1 ]; then
  code=$(curl -sS -o /dev/null -L -A "Mozilla/5.0" -w '%{http_code}' "$url" || echo 000)
  [ "$code" = 200 ] || { echo "App Store answered HTTP $code for $url (not released yet?). Re-run later, or pass --no-check." >&2; exit 1; }
  echo "App Store: HTTP 200 for $url"
fi

# the files that carry the placeholder (this script and the docs mention it by name)
files=$(git grep -l -F "$PH" -- . ':!scripts/apply-store-url.sh' ':!*.md' || true)
[ -n "$files" ] || { echo "no $PH left to replace (already applied?)" >&2; exit 1; }

for f in $files; do
  STORE_URL="$url" perl -pi -e 's/__STORE_URL__/$ENV{STORE_URL}/g' "$f"
  echo "replaced in $f"
done

left=$(git grep -n -F "$PH" -- . ':!scripts/apply-store-url.sh' ':!*.md' || true)
[ -z "$left" ] || { echo "placeholder still present:" >&2; echo "$left" >&2; exit 1; }
grep -q '^window.BOO_MODE = "live";' index.html || { echo "index.html is not in live mode (window.BOO_MODE)" >&2; exit 1; }
grep -qF "window.APP_STORE_URL = \"$url\";" index.html || { echo "index.html: APP_STORE_URL is not $url" >&2; exit 1; }
if grep -q 'Coming soon to the App Store\.">' index.html; then echo "index.html: a meta description still says Coming soon" >&2; exit 1; fi

echo "OK: no $PH left; index.html is live with $url"
git --no-pager diff --stat
