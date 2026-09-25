#!/usr/bin/env bash
# Makes a new bearer token for https://boomachine.app/notify-admin.php (the
# launch list: counts, CSV export, sending) and stores it
#   (a) in the macOS Keychain: service "boomachine-notify", account "admin"
#       (scripts/notify-send.php reads it from there), and
#   (b) as the GitHub Actions secret NOTIFY_ADMIN_TOKEN of fabric-8/boomachine-site
#       (the deploy workflow writes it into notify-config.php on the server).
# The token is never printed and never appears in a command line.
# Run it again to rotate; the old token stops working with the next deploy:
#   gh workflow run deploy-allinkl.yml -R fabric-8/boomachine-site
set -euo pipefail

REPO="fabric-8/boomachine-site"
SERVICE="boomachine-notify"
ACCOUNT="admin"

command -v gh >/dev/null || { echo "gh (GitHub CLI) is not installed" >&2; exit 1; }
gh auth status >/dev/null 2>&1 || { echo "gh is not logged in: run gh auth login" >&2; exit 1; }

token=$(openssl rand -hex 32)
[ ${#token} -eq 64 ] || { echo "could not generate a token" >&2; exit 1; }

printf 'add-generic-password -U -s %s -a %s -l "Boo Machine launch list admin token" -w %s\n' \
  "$SERVICE" "$ACCOUNT" "$token" | security -i >/dev/null
[ "$(security find-generic-password -s "$SERVICE" -a "$ACCOUNT" -w)" = "$token" ] \
  || { echo "Keychain write failed" >&2; exit 1; }
echo "Keychain: saved (service $SERVICE, account $ACCOUNT)."

printf '%s' "$token" | gh secret set NOTIFY_ADMIN_TOKEN -R "$REPO"
unset token
echo "GitHub: secret NOTIFY_ADMIN_TOKEN set on $REPO."
echo "Next: deploy so the server gets it: gh workflow run deploy-allinkl.yml -R $REPO"
