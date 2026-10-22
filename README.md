# FleetLog – hosted build (Render)

Plain Node (>=18), no dependencies. Code only: no PIN, no data, no backups in this repo.

## Environment
| Var | Meaning |
|---|---|
| `PORT` | set by Render automatically |
| `DATA_DIR` | where `data.json` and `kb-cache.json` live (`/var/data` on Render; default `./data`) |
| `PIN_HASH` | SHA-256 hex of the PIN – same format as the old `pin.hash` file. Unset = no PIN (local testing only) |

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
