# FleetLog – hosted build (Render)

Plain Node (>=18), no dependencies. Code only: no PIN, no data, no backups in this repo.

## Environment
| Var | Meaning |
|---|---|
| `PORT` | set by Render automatically |
| `DATA_DIR` | where `data.json` and `kb-cache.json` live (`/var/data` on Render; default `./data`) |
| `PIN_HASH` | SHA-256 hex of the PIN – same format as the old `pin.hash` file. Unset = no PIN (local testing only) |

| `OWNER_PAID` | `true` = the owner/default account (no signed-in user) is never locked by the trial. Set on Sergio's own instance. |
| `PAYMENT_URL` | link for the **Pay now** button on the trial-ended screen (optional; without it the button tells them to email support) |

## Free trial
Each new account gets a 3-day trial (`trialStart` saved on first use; older accounts get it the first time they're seen). A small "Trial: X days left" bar shows during the trial. After 3 days, unless the account has `billing: {"status":"paid"}` in its data file (or is the owner with `OWNER_PAID=true`), data routes return **402** and the app shows a payment screen (help: beagortransp@gmail.com). The PIN screen, `/api/billing` and `/healthz` still work. Data is never deleted. To mark an account paid, add `"billing": {"status": "paid"}` to its data file and restart.

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
