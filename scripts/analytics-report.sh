#!/usr/bin/env bash
# Prints a summary of the boomachine.app page statistics for the last N days.
#   scripts/analytics-report.sh [days]        (default 30, max 400)
#   scripts/analytics-report.sh 7 --json      raw JSON from stats.php
# The bearer token comes from the macOS Keychain (scripts/new-analytics-token.sh)
# and goes to curl on stdin, never on a command line or the screen.
# STATS_URL overrides the endpoint (e.g. a local test server).
set -euo pipefail

days="${1:-30}"
case "$days" in ''|*[!0-9]*) echo "usage: $0 [days] [--json]" >&2; exit 2 ;; esac
url="${STATS_URL:-https://boomachine.app/stats.php}?days=$days"

token=$(security find-generic-password -s boomachine-analytics -a stats -w 2>/dev/null) \
  || { echo "No token in the Keychain: run scripts/new-analytics-token.sh first." >&2; exit 1; }

tmp=$(mktemp); trap 'rm -f "$tmp"' EXIT
code=$(printf 'Authorization: Bearer %s\n' "$token" | curl -sS -H @- -o "$tmp" -w '%{http_code}' "$url")
unset token
if [ "$code" != 200 ]; then echo "stats.php answered HTTP $code: $(head -c 300 "$tmp")" >&2; exit 1; fi
if [ "${2:-}" = "--json" ]; then cat "$tmp"; exit 0; fi

python3 - "$tmp" <<'PY'
import json, sys
s = json.load(open(sys.argv[1]))
pct = lambda x: "  -  " if x is None else f"{x*100:4.0f}%"
def table(title, d, n=8):
    if not d: return
    tot = sum(d.values()) or 1
    print(f"\n{title}")
    for k, v in list(d.items())[:n]:
        print(f"  {k[:42]:<42} {v:>6}  {v/tot*100:3.0f}%")
t, b, e = s["totals"], s["beta"], s["engagement"]
print(f"Boo Machine · boomachine.app · {s['from']} to {s['to']} ({s['days']} days)")
print(f"\n  pageviews {t['pageviews']:>7}    visitors {t['visitors']:>6}   (daily uniques, summed)")
print(f"  beta clicks {b['clicks']:>5}    visitors who clicked {b['visitors_with_click']} = {pct(b['conversion']).strip()} conversion")
print(f"  engaged 10 s+ {pct(e['engaged_rate']).strip():>4} of visitors    changed a disc {pct(e['disc_rate']).strip()}")
if b["by_source"]: print("  clicks by control: " + ", ".join(f"{k} {v}" for k, v in b["by_source"].items()))
print("\nDay           views  visitors  beta")
for d in s["daily"][-14:]:
    bar = "#" * min(40, d["visitors"])
    print(f"  {d['date']}  {d['pageviews']:>5}  {d['visitors']:>8}  {d['beta_clicks']:>4}  {bar}")
if len(s["daily"]) > 14: print(f"  (last 14 of {len(s['daily'])} days)")
for name, key in (("Home page scroll depth (share of home pageviews)", "scroll_funnel"),
                  ("Story (share of home pageviews)", "story_funnel")):
    f = s[key]; print(f"\n{name}, {f['pageviews']} pageviews")
    for k, v in f.items():
        if k != "pageviews": print(f"  {k:<18} {v['pageviews']:>6}  {pct(v['rate'])}")
table("Pages", s["pages"]); table("Referrers", s["referrers"]); table("Campaigns (utm source / medium / campaign)", s["utm"])
table("Devices", s["devices"]); table("Browsers", s["browsers"]); table("Languages", s["languages"])
table("All events", s["events"], 20)
h = s["health"]; print(f"\nserver: data dir {h['data_dir']}, salt day {h['salt_day']}, PHP {h['php']}")
PY
