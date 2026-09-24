#!/usr/bin/env bash
# Makes a new bearer token for https://boomachine.app/stats.php and stores it
#   (a) in the macOS Keychain: service "boomachine-analytics", account "stats"
#       (scripts/analytics-report.sh reads it from there), and
#   (b) as the GitHub Actions secret ANALYTICS_TOKEN of fabric-8/boomachine-site
#       (the deploy workflow writes it into analytics-config.php on the server).
# The token is never printed and never appears in a command line.
# Run it again to rotate; the old token stops working with the next deploy:
#   gh workflow run deploy-allinkl.yml -R fabric-8/boomachine-site
set -euo pipefail

REPO="fabric-8/boomachine-site"
SERVICE="boomachine-analytics"
ACCOUNT="stats"

command -v gh >/dev/null || { echo "gh (GitHub CLI) is not installed" >&2; exit 1; }
gh auth status >/dev/null 2>&1 || { echo "gh is not logged in: run gh auth login" >&2; exit 1; }

# 64 hex characters = 256 random bits (letters and digits only, as the workflow expects)
token=$(openssl rand -hex 32)
[ ${#token} -eq 64 ] || { echo "could not generate a token" >&2; exit 1; }

# Keychain: `security -i` reads the command from stdin, so the token is not in ps output.
printf 'add-generic-password -U -s %s -a %s -l "Boo Machine stats token" -w %s\n' \
  "$SERVICE" "$ACCOUNT" "$token" | security -i >/dev/null
[ "$(security find-generic-password -s "$SERVICE" -a "$ACCOUNT" -w)" = "$token" ] \
  || { echo "Keychain write failed" >&2; exit 1; }
echo "Keychain: saved (service $SERVICE, account $ACCOUNT)."

# GitHub: gh secret set reads the value from stdin when --body is not given.
printf '%s' "$token" | gh secret set ANALYTICS_TOKEN -R "$REPO"
unset token
echo "GitHub: secret ANALYTICS_TOKEN set on $REPO."
echo "Next: deploy so the server gets it: gh workflow run deploy-allinkl.yml -R $REPO"
