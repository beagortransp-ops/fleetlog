# FleetLog accounts (Phase 1)

- Email + password accounts stored in `DATA_DIR/users.json` (scrypt with a per-user salt, plus a random session token kept as sha256 server-side).
- Cookie `fl_sess`: HttpOnly, SameSite=Lax, Secure when served over https. Sessions last 30 days.
- Routes: `POST /api/auth/signup`, `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`.
- Login is limited to 8 wrong tries per IP+email per 15 minutes. Passwords must be 8+ characters.
- Every data route needs a session (401 otherwise) and uses that account's own store. The `X-User` header is ignored.
  `GET /api/billing` without a session returns plans only.
- Plan/trial: the trial starts when the account's store is created. Paid plan changes are mirrored onto the user record (`plan`, `cycle`, `activePlan`).

## Owner / legacy data (data.json)
Exactly one account adopts the legacy store `DATA_DIR/data.json` (and keeps `OWNER_PAID` exemption):
1. If env `OWNER_EMAIL` is set: the account that signs up with that email.
2. If `OWNER_EMAIL` is unset: the first account ever created, but only if data.json already has real (non-example) trucks, services or parts.
It's one-time: once an account has `legacy: true`, no other account can adopt it.

## PIN
If `PIN_HASH` (env) or a `pin.hash` file next to server.js exists, the PIN is still required on every /api call (including sign-in).
So the iMac asks for the PIN first, then the account log-in. That's two gates; remove pin.hash to keep only accounts.

## Still to do
Persistent database (Render free tier wipes files on deploy, so accounts reset too), Stripe webhook, password reset email via Resend.
