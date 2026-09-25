# The launch list (email sign-up, double opt-in)

People leave their address on boomachine.app; Boo Machine writes to them when it launches on the App Store and when new discs drop. Nothing else. Everything runs as plain PHP on the ALL-INKL web space, next to the page statistics (`a.php`), with the same house rules: data in `_data/`, secrets written by the deploy, strict input checks, a post-deploy check. No Composer, no third-party service.

This file is not deployed (the workflow excludes it).

## How it works

```
form on index.html ──POST JSON──▶ subscribe.php ──▶ _data/notify/list.json  (status pending, token)
                                        │
                                        └──▶ confirmation mail  "Confirm your soul (Boo Machine)"
                                                  │  link: https://boomachine.app/confirm.php?t=<token>
                                                  ▼
                                   confirm.php ──▶ status confirmed (+ analytics event notify_confirmed)
                                                  │
     scripts/notify-send.php (your Mac) ──HTTPS──▶ notify-admin.php ──▶ launch / new-disc mail to every
                                                                        confirmed address, each with its
                                                                        own unsubscribe link + one-click
                                                                        List-Unsubscribe header
                                   unsubscribe.php ──▶ address and token deleted, tombstone kept
```

| File | Deployed | What it does |
|---|---|---|
| `subscribe.php` | yes | The sign-up endpoint (contract below). |
| `confirm.php` | yes | The confirmation link. GET shows a page that posts the token back at once (script) or on a button (no script); the POST confirms. Mail scanners open every link in a mail, so a plain GET never confirms. Idempotent. |
| `unsubscribe.php` | yes | GET shows one "Unsubscribe" button, the button (POST) unsubscribes. `POST ?t=` with body `List-Unsubscribe=One-Click` is RFC 8058 one-click from Gmail, Apple Mail and co. |
| `notify-admin.php` | yes | Bearer-token admin API: counts, CSV export, erasure, campaigns. Without a configured token it refuses everything (503). |
| `notify-lib.php` | yes, never served | Shared code: store, mailer, SMTP client, pages. The root `.htaccess` denies it; it also refuses to run when requested directly. |
| `notify-config.php` | written by the deploy | Admin token and SMTP credentials from GitHub secrets. Never in git (`.gitignore`), never in the rsync stage, denied by `.htaccess`. |
| `scripts/notify-send.php` | no (`scripts/`) | CLI on your Mac that drives the sending. Refuses to run as a web request. |
| `scripts/new-notify-token.sh` | no | Makes the admin token: Keychain + GitHub secret. |
| `scripts/mail/launch.*` | no | A starting point for the launch mail (subject, text, HTML). |

## The sign-up contract (used by the frontend)

`POST /subscribe.php`, body JSON `{"email": "...", "consent": true, "hp": "", "src": "hero" | "bar" | "support"}`, at most 2 KB.

| Answer | When |
|---|---|
| `200 {"ok":true,"status":"pending"}` | A confirmation mail is on its way. Also: an address that is still unconfirmed and already got 3 mails in 24 hours (no new mail), and a filled honeypot (nothing stored, nothing sent). |
| `200 {"ok":true,"status":"already"}` | The address is confirmed already; no mail. |
| `400 {"ok":false,"error":"invalid"}` | Bad address, `consent` not exactly `true`, not JSON, too large, or not from the site itself (Origin, else Referer, must be boomachine.app or www.; localhost only when the server itself runs on localhost; `Sec-Fetch-Site`, if sent, must be `same-origin`). |
| `429 {"ok":false,"error":"rate"}` | More than 5 attempts in 10 minutes from one network (IPv4 address or IPv6 /64), or the flood brake: 150 confirmation mails per hour across all addresses. |
| `500 {"ok":false,"error":"server"}` | Storage or mail failed (details in `_data/notify/errors.log`, without addresses). |
| `405` | Not POST. |

Address checks: trimmed and lowercased, `filter_var`, at most 254 characters (local part 64), a real-looking domain, no reserved domains (example.com, .test, .invalid, .localhost, .local ...), and a DNS lookup: the domain must have an MX record, or at least an A/AAAA record (RFC 5321 fallback). The lookup is cheap (the resolver caches) and runs only after the cheap checks and the rate limit. An unknown `src` is stored as `other` rather than refused.

`already` tells whoever types an address that it is on the list. That is the agreed contract; the cost is low (it reveals only interest in a Halloween app) but it is an enumeration signal, so the per-network rate limit applies to it as well.

## What is stored, and for how long

`_data/notify/` on the server (the deploy never deletes or overwrites it; `_data/.htaccess`, the root `.htaccess` and `_data/notify/.htaccess` all deny HTTP access):

| File | Content | Retention |
|---|---|---|
| `list.json` | One entry per address, keyed by HMAC(secret, address): `email` (lowercased), `status` pending/confirmed, `created`, `confirmed_at`, `consent_v` (consent text version), `consent_hash` (SHA-256 of the exact consent sentence), `src` (which form), `token` (32 hex, random_bytes), `ip_hash` (HMAC of the sign-up IP), `confirm_ip_hash`, `mails` (times confirmation mails were sent). Plus the last hour's mail times for the flood brake. | Confirmed: until unsubscribed or deleted. Pending: deleted 7 days after sign-up (purged on every write). |
| tombstones in `list.json` | After unsubscribing: only `{status: unsubscribed, unsubscribed_at}` under the keyed hash. No address, no token. Proves the withdrawal, recognises the address if it is ever entered again. Signing up again (new double opt-in) replaces it. | As long as the list is in use. |
| `secret.json` | The HMAC key for address keys and IP hashes. Never leaves the server. Losing it makes existing keys unmatchable (sign-ups would duplicate): back it up with the list. | Permanent. |
| `rl/<hash>` | Sign-up attempt times per network, keyed by HMAC of the IP (or IPv6 /64). | Minutes: files older than 10 minutes are deleted on every sign-up. |
| `campaigns/<id>.json`, `.log` | Each sent mail's text and which keys got it; the log has keys and results, no addresses. | Until you delete them. |
| `errors.log` | Delivery errors, with the first 8 characters of a key at most. | Until you delete it. |

The IP address itself is never stored. The consent record per entry (time, consent version and hash, keyed IP hash for sign-up and confirmation, the confirmation mail times) is the double opt-in log.

Written for the frontend on 2026-09-25, the consent sentence is `CONSENT_TEXT` in `notify-lib.php`:

> Leave your email and we’ll tell you at launch and when new discs drop. No spam. Details in our privacy notice.

If the sentence next to the form changes, change `CONSENT_TEXT` and bump `CONSENT_VERSION` in the same commit.

## How mail is sent, and what to configure

The code picks the first that applies:

1. **Dev** (`php -S`, or `NOTIFY_DEV=1` on the CLI): nothing leaves the machine; each mail is an `.eml` file in `_data/notify/outbox/`.
2. **Authenticated SMTP** when `notify-config.php` has `smtp_host`: a small built-in client (implicit TLS on 465, STARTTLS on 587, AUTH LOGIN, certificate verified, one connection reused per campaign batch; plaintext is refused except to localhost).
3. **PHP `mail()`** otherwise, with the envelope sender `-f noreply@boomachine.app`.

Every mail: `From: Boo Machine <noreply@boomachine.app>`, `Reply-To: support@boomachine.app`, `Message-ID`, `Date`, MIME multipart/alternative (plain text + HTML, UTF-8, quoted-printable). Confirmation mails add `Auto-Submitted: auto-generated`; campaign mails add `List-Id`, `List-Unsubscribe` (https link + mailto) and `List-Unsubscribe-Post: List-Unsubscribe=One-Click`.

Why both: on ALL-INKL, `mail()` hands the message to the same server that is boomachine.app's MX (`v038701.kasserver.com`), and the domain's SPF record (`v=spf1 a mx include:spf.kasserver.com ~all`) covers it, so `mail()` works with no setup at all. Authenticated SMTP through the `noreply@` mailbox is still the better road: the message goes through ALL-INKL's submission path like any mail program's, where the account's DKIM signing applies, it is independent of the PHP sendmail setup, and failures come back as clear SMTP errors instead of `mail()` returning false. It costs four secrets.

What to do (all optional; without anything, sign-ups work over `mail()` and the admin endpoint is off):

1. **Admin token** (needed for counts, export and sending): run `scripts/new-notify-token.sh` (Keychain entry `boomachine-notify`/`admin` + GitHub secret `NOTIFY_ADMIN_TOKEN`).
2. **SMTP** (recommended), GitHub secrets on `fabric-8/boomachine-site`:
   - `NOTIFY_SMTP_HOST` = `v038701.kasserver.com` (the server in KAS; the same as the domain's MX)
   - `NOTIFY_SMTP_PORT` = `465` (or `587` for STARTTLS; empty means 465)
   - `NOTIFY_SMTP_USER` = the mailbox login of noreply@boomachine.app (ALL-INKL accepts the address itself or the `m0...` login)
   - `NOTIFY_SMTP_PASS` = its password
   - optional `NOTIFY_SMTP_SECURE` = `ssl` or `tls` to override the port default

   Set them without the value on a command line, e.g. `gh secret set NOTIFY_SMTP_PASS -R fabric-8/boomachine-site` (it prompts).
3. **DKIM**: check in KAS that DKIM is switched on for boomachine.app (Domain → DKIM). DMARC is `p=none` today, which is fine for this volume.
4. **Bounces and replies**: bounces go to noreply@boomachine.app (the envelope sender), replies to support@. Set a forward from noreply@ to support@ in KAS or look into that mailbox after each campaign.
5. Deploy: `gh workflow run deploy-allinkl.yml -R fabric-8/boomachine-site`. The "Write the notify config" step writes `notify-config.php` from whatever secrets exist (warnings for missing ones); the check step then tests the endpoints.
6. First real test after the deploy: sign up with your own address on the live page, confirm, then `php scripts/notify-send.php ... --test you@...` (below).

## Sending the launch mail (or a new-disc mail)

Shared hosting cuts long requests off, so the server sends in batches of at most ~20 seconds, and the script on your Mac keeps asking for the next batch until the server says done. The server records every address right after its mail, refuses a second concurrent run, re-reads the list before every mail (an unsubscribe during the run is honoured), and a person who confirms later gets the mail the next time you run the same command.

1. Copy `scripts/mail/launch.*` somewhere (they are templates) and fill in `{{app_store_url}}`. Keep `{{unsubscribe_url}}` in both the text and the HTML: the server fills in each person's link. The script refuses any other `{{...}}` left in the files.
2. Preview to yourself:
   ```
   php scripts/notify-send.php --id launch-2026 --subject-file launch.subject.txt --text launch.txt --html launch.html --test you@example.org
   ```
3. Count, without sending: add `--dry-run` instead of `--test`.
4. Send: run it without `--test`/`--dry-run`. It shows the number and asks you to type `SEND`. One mail per second by default (`--interval 2` for slower). Interrupt any time and run the same command again to resume; nobody gets the mail twice. A different text under the same `--id` is refused once sending has started: use a new id (e.g. `disc-coven-2026`).
5. Addresses the mail server refused are marked failed; `--retry-failed` tries them again.

The script logs to `notify-send-<id>.log` in the current folder (no addresses; git-ignored), the server to `_data/notify/campaigns/<id>.log`.

For large lists, check the account's sending limits in KAS first; at one mail per second a list of 1,000 takes about 17 minutes.

## Export, counts, erasure

The admin endpoint never answers without the token; nothing lists addresses otherwise.

```
TOKEN=$(security find-generic-password -s boomachine-notify -a admin -w)
# counts (numbers only)
printf 'Authorization: Bearer %s\n' "$TOKEN" | curl -sH @- 'https://boomachine.app/notify-admin.php?action=counts'
# CSV of confirmed addresses: email, confirmed_at, created, src, consent_version
printf 'Authorization: Bearer %s\n' "$TOKEN" | curl -sH @- 'https://boomachine.app/notify-admin.php?action=export' > list.csv
# erasure request (Art. 17): delete an address, keep a tombstone so it is never mailed; "purge":true keeps nothing
printf 'Authorization: Bearer %s\n' "$TOKEN" | curl -sH @- -X POST --data '{"action":"delete","email":"person@example.org"}' https://boomachine.app/notify-admin.php
# campaign progress
printf 'Authorization: Bearer %s\n' "$TOKEN" | curl -sH @- 'https://boomachine.app/notify-admin.php?action=campaigns'
```

`scripts/analytics-report.sh` also shows the list's numbers (confirmed / waiting / left) and the sign-up and App Store click events.

An access request (Art. 15): export the CSV and send the person their row. Keep exported CSVs off shared folders and delete them when done.

## Analytics

`a.php` accepts `notify_submit` (with `s` = hero|bar|support), `store_click` (with `s` = hero|bar|support|slide|link) and `notify_confirmed`. `confirm.php` writes `notify_confirmed` itself on the first confirmation, straight into the day's event file, with a random page id and visitor hash (nothing about the visitor). `stats.php` has two new blocks, `notify` (submits, visitors who submitted, conversion, by source, confirmations, current list counts) and `store` (clicks, conversion, by source), and the daily rows count `notify_submits`, `notify_confirmed` and `store_clicks`. `beta` stays for the older data.

legal.html's "Page statistics" list of what is counted needs the new events: the sign-up form was sent, a sign-up was confirmed, the App Store link was clicked.

## Testing locally

```
php -S localhost:8802 -t .
```

With the built-in server, mails land in `_data/notify/outbox/*.eml`, links point at `http://localhost:8802`, and the DNS check is skipped (`NOTIFY_DNS=1` turns it on). `php -S` ignores `.htaccess`, so it serves `_data/` files: that is expected locally; on Apache the three deny layers above apply, and the deploy check verifies them. For the admin endpoint write a local `notify-config.php` (`<?php return ['admin_token' => '<32+ letters/digits>'];`, git-ignored) and use `--url http://localhost:8802` with `NOTIFY_ADMIN_TOKEN=...` on the CLI.

## Deploy check

After every deploy the workflow expects: `subscribe.php` GET 405 and POST `{}` 400; `confirm.php` and `unsubscribe.php` with an unknown token 410; `_data/notify/`, `_data/notify/list.json`, `_data/notify/secret.json`, `notify-config.php`, `notify-lib.php`, `README-NOTIFY.md` 403 or 404; `notify-admin.php` 503 without a token secret, else 401 without the header and valid JSON counts with it. It never signs up (that would send a mail).

## Privacy notice text for legal.html

Ready to paste into the privacy notice (after "Page statistics, without cookies", before "No cookies, no third parties" or wherever it fits). It uses legal.html's first person.

```html
<h3 id="notify">Launch and new-disc emails</h3>
<p>If you enter your email address in the form on this site, I use it for one thing only: to tell you by email when Boo Machine launches on the App Store and when new discs for it come out. You get no other mails, and your address is never passed on, sold or used for advertising.</p>
<p><strong>Double opt-in.</strong> After you send the form, a confirmation mail goes to the address you entered. Only when you click the link in it is the address added to the list. If you do not confirm, the unconfirmed entry is deleted automatically after 7 days.</p>
<p><strong>What is stored:</strong></p>
<ul>
  <li>your email address;</li>
  <li>the time you signed up, the times confirmation mails were sent, and the time you confirmed;</li>
  <li>which version of the sign-up text you agreed to (with a checksum of its exact wording) and which form on the page you used;</li>
  <li>a keyed hash of the IP address you signed up from and of the one you confirmed from. The IP address itself is not stored, and the hash cannot be turned back into it without a secret key that never leaves the server;</li>
  <li>a random code for your personal confirmation and unsubscribe links.</li>
</ul>
<p>To stop abuse of the form, the server also counts sign-up attempts per network for 10 minutes, under a keyed hash of the IP address; these counters are deleted with the next sign-up after that.</p>
<p><strong>Legal basis.</strong> Sending the emails is based on your consent, Article 6 (1) (a) GDPR. Keeping the record of your sign-up and confirmation serves to demonstrate that consent (Article 7 (1) GDPR); the legal basis for that is Article 6 (1) (f) GDPR, my legitimate interest being to be able to prove that you asked for the emails.</p>
<p><strong>Where.</strong> The list is kept as files on my web space at ALL-INKL.COM in Germany, and the emails are sent from ALL-INKL's mail servers in Germany, which process the data on my behalf under the data processing agreement mentioned above. No newsletter service or other third party is involved.</p>
<p><strong>How long.</strong> Until you unsubscribe or ask me to delete your address. Unconfirmed sign-ups are deleted after 7 days. When you unsubscribe, your address and your links are deleted at once; what remains is a keyed hash of the address with the date you left, which cannot be read as an address and only serves to show that you withdrew your consent and to make sure no further mails reach you. If you sign up again later, it is replaced by a new sign-up.</p>
<p><strong>Withdrawing consent.</strong> You can withdraw your consent at any time, without giving reasons: with the unsubscribe link at the bottom of every email (or your mail app's unsubscribe button), or by writing to <a href="mailto:support@boomachine.app">support@boomachine.app</a>. Withdrawal does not affect the lawfulness of the emails sent before it. Your other rights are listed under <a href="#rights">Your rights</a>.</p>
```

Also update the "Page statistics" bullet about what happened on the page: add "the email sign-up form was sent, a sign-up was confirmed, or the App Store link was clicked".
