# FleetLog – hosted build (Render)

Plain Node (>=18), no dependencies. Code only: no PIN, no data, no backups in this repo.

## Environment
| Var | Meaning |
|---|---|
| `PORT` | set by Render automatically |
| `DATA_DIR` | where `data.json` and `kb-cache.json` live (`/var/data` on Render; default `./data`) |
| `PIN_HASH` | SHA-256 hex of the PIN – same format as the old `pin.hash` file. Unset = no PIN (local testing only) |

| `OWNER_PAID` | `true` = the owner/default account (no signed-in user) is never locked by the trial. Set on the owner's own instance. |
| `PAYMENT_URL` | legacy single pay link (kept for compatibility; plan links below are preferred) |
| `STRIPE_LINK_BASIC_MONTHLY` / `STRIPE_LINK_BASIC_YEARLY` | Stripe Payment Link URLs for Basic |
| `STRIPE_LINK_PREMIUM_MONTHLY` / `STRIPE_LINK_PREMIUM_YEARLY` | Stripe Payment Link URLs for Premium |
| `STRIPE_LINK_PRO_MONTHLY` / `STRIPE_LINK_PRO_YEARLY` | Stripe Payment Link URLs for Pro |
| `TEST_PAYMENTS` | `true` shows "Test payment (no charge)" buttons and enables `?testTrialEnd=1`. Default: ON when no Stripe links are set, OFF otherwise. Set `false` once real payments go live. |

## Plans (defined once in `server.js` → `PLANS`, exposed by `/api/billing` as `plans`)
| Plan | Monthly | Yearly | Trucks | Adds |
|---|---|---|---|---|
| Basic | $15.99 | $159 | up to 5 | core: service log, tires & parts, inspections, FedEx Monthly Record & VIR printing, reminders, phone access |
| Premium (most popular) | $19.99 | $199 | up to 15 | + all-trucks batch printing, cost dashboard by truck |
| Pro | $24.99 | $249 | unlimited | + unlimited trucks, priority email support |

The **Plans & billing** screen opens when the trial ends, from the trial bar link, and from Settings. Each plan button opens its Stripe Payment Link with `?client_reference_id=<user>`; with no link set it says "Online payment coming soon – contact fleetlog.support@gmail.com".

### Test mode
- `POST /api/billing/test {"plan":"basic|premium|pro","period":"monthly|yearly"}` marks the account paid (`billing.test=true`, renews +1 mo/+1 yr). `DELETE /api/billing/test` cancels it (trial-ended screen returns). Both need the PIN when `PIN_HASH` is set, and work after the trial ends.
- Add `?testTrialEnd=1` to the page URL (or any API call) to set the trial start to 4 days ago.

### Stripe Payment Links (test mode, no real money)
1. dashboard.stripe.com → toggle **Test mode** on.
2. Product catalog → add products Basic / Premium / Pro, each with a recurring monthly and yearly price.
3. Payment Links → create one link per price (6 total). Under After payment you can redirect to `https://fleetlog-o5z2.onrender.com`.
4. Paste each link URL into the matching `STRIPE_LINK_*` env var on Render. Pay with test card `4242 4242 4242 4242`, any future date, any CVC.
5. Note: a Payment Link payment does not yet mark the account paid automatically (needs a Stripe webhook – not built). Until then mark paid by hand (below) or use test payments.

## Free trial
Each new account gets a 3-day trial (`trialStart` saved on first use; older accounts get it the first time they're seen). A small "Trial: X days left" bar shows during the trial. After 3 days, unless the account has `billing: {"status":"paid"}` in its data file (or is the owner with `OWNER_PAID=true`), data routes return **402** and the app shows a payment screen (help: fleetlog.support@gmail.com). The PIN screen, `/api/billing` and `/healthz` still work. Data is never deleted. To mark an account paid, add `"billing": {"status": "paid"}` to its data file and restart.

Wrong PINs are limited to 5 per 15 minutes per IP (HTTP 429). The PIN is only accepted in the `X-Pin` header (the app's sign-in screen); `?pin=` and `#pin=` links no longer work.
Health check: `GET /healthz`.

## Make PIN_HASH (on your Mac, PIN never shown or saved)
```
read -s -p "PIN: " P; echo; printf %s "$P" | shasum -a 256 | cut -d' ' -f1; unset P
```
Or reuse the existing hash: `cat ~/Desktop/FleetLog/pin.hash` (it is already a hash, not the PIN).
Paste the 64-character result into Render → service → Environment → `PIN_HASH`. Never commit it.

## Deploy
1. Push this folder to a **private** GitHub (or GitLab/Bitbucket) repo.
2. Render → New → Blueprint → pick the repo (uses `render.yaml`: Starter web service + 1 GB disk at `/var/data`).
3. Enter `PIN_HASH` when asked. Deploy.
4. Copy data once: Render → service → Shell, or upload via the app. Simplest: in the Render Shell
   `cat > /var/data/data.json` and paste the iMac's data.json, then restart the service.
5. Open `https://<service>.onrender.com`, enter the PIN, check trucks, Monthly Record and VIR print.

## Backups
Render keeps daily disk snapshots on paid disks. Also keep a nightly copy: export CSVs from Settings, or
`curl -H "X-Pin: <pin>" https://<service>.onrender.com/api/state > fleetlog-$(date +%F).json` on the iMac.

## Local run
`PIN_HASH=<hash> DATA_DIR=./data node server.js` → http://localhost:8790

## Subscription compliance (California auto-renewal) – owner setup
- Public pages: `/terms`, `/privacy`, `/refund` (static files in `public/`). Footer links on the app, sign-in and plan screens.
- Every plan card shows the auto-renewal terms next to its buy button, and a required consent checkbox. Each consent is recorded via `POST /api/billing/consent` in `db.consents` (time, plan, cycle, price, text version, IP) – keep for at least 3 years.
- Online cancel: "Manage or cancel subscription" (Settings and Plans & billing). Set env `STRIPE_PORTAL_URL` (or the `STRIPE_PORTAL_URL` constant in `public/legal.js`) to the Stripe Customer Portal login link. If empty, the button opens an in-app cancel form that emails fleetlog.support@gmail.com (subject "Cancel subscription") via Resend, or opens a mailto as fallback. You must then cancel it in Stripe yourself and reply.
- After payment (`?paid=`) the app shows an on-screen confirmation with plan, price, renewal terms and how to cancel.
- Confirmation/reminder emails are sent by Stripe. In the Stripe Dashboard turn on:
  - Settings > Customer emails: **Successful payments** (receipts), **Upcoming renewals** (reminders, needed for yearly plans), **Trial ending reminders** (Pro yearly 10-day trial).
  - Settings > Billing > **Customer portal**: activate, allow **cancel subscriptions**, copy the portal login link into `STRIPE_PORTAL_URL` on Render.
