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
#
# Campaign links: index.html builds one Apple campaign link per control from
# this URL and window.APP_STORE_PT (the provider ID): ct=site-slide for the
# slider, site-bar for the bar, site-link for <a data-store-link>. Pass the
# plain store URL here, not a campaign link. The script checks that
# APP_STORE_PT is a number (app/docs/marketing/halloween-2026/
# set-campaign-pt.sh changes it) and, online, that the site-slide campaign
# link opens too.
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
case "$url" in *id000000000*|*"$PH"*|*__PT__*) echo "that is the placeholder, not the real link" >&2; exit 2 ;; esac
case "$url" in *[?\&]ct=*|*[?\&]pt=*) echo "pass the plain store URL; index.html adds pt and ct per control" >&2; exit 2 ;; esac

cd "$(dirname "$0")/.."

pt=$(sed -n 's/^window\.APP_STORE_PT = "\([^"]*\)";$/\1/p' index.html)
case "$pt" in
  ''|*[!0-9]*) echo "index.html: window.APP_STORE_PT is \"$pt\", not a provider ID (run app/docs/marketing/halloween-2026/set-campaign-pt.sh <number>)" >&2; exit 1 ;;
esac
case "$url" in *\?*) sep='&' ;; *) sep='?' ;; esac
campaign() { printf '%s%spt=%s&ct=%s&mt=8' "$url" "$sep" "$pt" "$1"; }

if [ "$check" = 1 ]; then
  code=$(curl -sS -o /dev/null -L -A "Mozilla/5.0" -w '%{http_code}' "$url" || echo 000)
  [ "$code" = 200 ] || { echo "App Store answered HTTP $code for $url (not released yet?). Re-run later, or pass --no-check." >&2; exit 1; }
  echo "App Store: HTTP 200 for $url"
  c=$(campaign site-slide)
  code=$(curl -sS -o /dev/null -L -A "Mozilla/5.0" -w '%{http_code}' "$c" || echo 000)
  [ "$code" = 200 ] || { echo "App Store answered HTTP $code for the campaign link $c" >&2; exit 1; }
  echo "App Store: HTTP 200 for $c"
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
grep -q 'storeLink("site-slide")' index.html && grep -q 'storeLink("site-bar")' index.html \
  || { echo "index.html: the slider or the bar no longer uses its campaign link (storeLink)" >&2; exit 1; }
left=$(git grep -n -F "__PT__" -- . ':!scripts/apply-store-url.sh' ':!*.md' || true)
[ -z "$left" ] || { echo "provider-ID placeholder __PT__ still present:" >&2; echo "$left" >&2; exit 1; }

echo "OK: no $PH left; index.html is live with $url"
echo "Campaign links the page will use (pt=$pt):"
for ct in site-slide site-bar site-link; do echo "  $ct  $(campaign "$ct")"; done
git --no-pager diff --stat
