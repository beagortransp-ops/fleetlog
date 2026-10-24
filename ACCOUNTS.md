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

## Team members (TEAM1)
- Owner or Admin: Settings > Team > enter an email (optional) + role > Invite. This makes a one-time link `/invite/<token>` that expires in 7 days (Copy button; share by WhatsApp). Pending invites can be copied again or revoked.
- Invite page: a new person sets a password (8+ chars); an existing account signs in instead. If the invite has an email, only that email can use it.
  Accounts that own a fleet (legacy/OWNER_EMAIL account, or an account with its own members) can't join another team.
- Stored in `users.json`: member user gets `memberOf` (the owner's store key: `''` = data.json, else owner user id), `role` (`admin`|`user`), `joinedAt`. Invites in `invites[]`.
  Accounts without `memberOf` behave exactly as before (own store), so existing data needs no migration.
- A member's session opens the owner's store. Billing/paid/owner exemption are read from the store (owner), so members inherit them.
- Roles, enforced on the server for every API route:
  - Owner: everything. Can't be removed or demoted (403).
  - Admin: everything, incl. Settings, billing, Sheet Sync, driver link, team.
  - User: read/edit trucks, services, parts, inspections, reports, etc. 403 on `billing`, `sheetsync`, `driverlink`, `team`, `example`, `export`, `kb/refresh`, and on writes to `intervals`/`profile`. `GET /api/state` hides driverLink, sheetSync, billing and consents. The Settings tab is hidden in the UI.
- Routes: `GET /api/team`, `POST /api/team/invite`, `DELETE /api/team/invite/<id>`, `PUT /api/team/<userId>` {role}, `DELETE /api/team/<userId>`; public `GET|POST /api/invite/<token>`.
- Removing a member clears `memberOf` and deletes all of their sessions at once (they're logged out). A role change also signs the member out so it applies right away. Their own account and any own data stay; on next login they see their own (empty) store.

## PIN
If `PIN_HASH` (env) or a `pin.hash` file next to server.js exists, the PIN is still required on every /api call (including sign-in).
So the iMac asks for the PIN first, then the account log-in. That's two gates; remove pin.hash to keep only accounts.

## Still to do
Persistent database (Render free tier wipes files on deploy, so accounts reset too), Stripe webhook, password reset email via Resend.
