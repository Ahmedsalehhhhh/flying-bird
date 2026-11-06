# Flying Bird — API

Base URL: `https://<server>/api` (local: `http://localhost:3000/api`). Everything is JSON.

The game uses three endpoints: `POST /login`, `GET /session` (every time the game opens) and `POST /play`. Accounts are created by the admin from the dashboard (there is no register).

**Subscriptions:** every streamer account has a start date and an end date set by the admin (1–12 months). Outside those dates the account cannot log in or play. Agency accounts never expire unless the admin gives them a subscription.

**Build integrity (optional, off by default):** the game can send `X-Build-Hash` (sha1 or sha256 hex of its own executable) on every request. The admin registers the official hash of each release in the dashboard ("نسخ ... المعتمدة" card). While `ENFORCE_BUILD_CHECK` is off (the default), an unrecognized or missing hash is only logged on the account (visible as an alert in the users table) — nothing is blocked. Once the admin has registered every live build and turns `ENFORCE_BUILD_CHECK=true` on, requests with an unrecognized hash get `403 BUILD_MISMATCH`.

---

## Login (the game)

### `POST /api/login`

```json
{
  "gameId": "flying-bird",
  "username": "streamer1",
  "password": "stream123",
  "deviceId": "A1B2C3D4E5F6A7B8"
}
```

| Field | Rule |
|---|---|
| `gameId` | a game added in the dashboard (card "اللعب") |
| `username`, `password` | the ones the admin gave the streamer |
| `deviceId` | 8–64 chars: letters, numbers, `-`. Must be the same value every time on the same PC |

**How the device lock works**

- First successful login → the account is locked to that `deviceId`.
- Same `deviceId` later → OK.
- Any other `deviceId` → `403 WRONG_DEVICE` (and the admin sees an alert).
- Streamer changed PC → admin presses **"فك ربط الجهاز"** and the next login locks to the new PC.

**200 OK**

```json
{
  "ok": true,
  "message": "login successful",
  "token": "eyJhbGciOi...",
  "session": { "expiresAt": "2026-12-05T14:00:00.000Z" },
  "subscription": { "startsAt": "2026-11-01T00:00:00.000Z", "endsAt": "2027-02-01T00:00:00.000Z", "daysLeft": 88 }
}
```

`ok: true` = logged in. `subscription` is `null` for accounts that never expire.

**Errors** — always `{ "ok": false, "code": "...", "message": "..." }`

| HTTP | code | Meaning |
|---|---|---|
| 400 | `UNKNOWN_GAME` | no game with this `gameId` |
| 400 | `INVALID_INPUT` | missing field / bad `deviceId` |
| 401 | `WRONG_CREDENTIALS` | wrong username or password |
| 403 | `WRONG_DEVICE` | account is locked to another device |
| 403 | `BANNED` | banned by admin (`reason` included) |
| 403 | `GAME_DISABLED` | the admin turned this game off (checked after the password) |
| 403 | `BUILD_MISMATCH` | unrecognized game build (only once the admin turns on `ENFORCE_BUILD_CHECK`; off by default) |
| 403 | `NO_SUBSCRIPTION` | streamer has no subscription |
| 403 | `SUBSCRIPTION_NOT_STARTED` | start date is in the future (`startsAt`, `endsAt` included) |
| 403 | `SUBSCRIPTION_EXPIRED` | end date passed (`startsAt`, `endsAt` included) |
| 429 | `TOO_MANY_ATTEMPTS` | too many wrong passwords (`retryAfterSec` included) |
| 500 | `SERVER_ERROR` | |

The subscription is checked **before** the device lock, so an expired account never locks a device.

Save the `token` (and the `deviceId`): the game sends them to `/session` every time it opens, and to `/play`.

Every login gives a **new** token and the previous token stops working (`SESSION_ENDED`). Only the newest token is valid.

**Session length:** the session lasts **30 days** (`SESSION_DAYS`) from the **last** valid `/session` or `/play` call, and every valid call pushes it 30 days forward again automatically. The token itself does not change, so keep using the same saved token. A streamer who opens the game at least once a month never has to log in again. After 30 days without opening the game, the next call returns `401 TOKEN_EXPIRED` and the streamer logs in again.

---

## Session check (the game)

### `GET /api/session`

Call it **every time the game opens**, with the saved token. No body, same headers as `/play`:

```
Authorization: Bearer <token from /login>
X-Device-Id: <the SAME deviceId sent in /login>
```

**200 OK** → the session is valid, continue to the main menu

```json
{
  "ok": true,
  "message": "session valid",
  "user": { "username": "streamer1", "type": "streamer" },
  "session": { "expiresAt": "..." },
  "subscription": { "startsAt": "...", "endsAt": "...", "daysLeft": 88 }
}
```

Errors are the same as `/play` (table below). No saved token, or any 401 → show the login screen.

---

## Play (the game)

### `POST /api/play`

Call it when the streamer presses **PLAY / START**. No body, only headers:

```
Authorization: Bearer <token from /login>
X-Device-Id: <the SAME deviceId sent in /login>
```

**200 OK** → start the game

```json
{ "ok": true, "message": "ok to play", "session": { "expiresAt": "..." }, "subscription": { "startsAt": "...", "endsAt": "...", "daysLeft": 88 } }
```

**Errors**

| HTTP | code | Meaning | Game does |
|---|---|---|---|
| 401 | `NO_TOKEN` | no Authorization header | back to login |
| 401 | `TOKEN_EXPIRED` | no valid request for 30 days (`SESSION_DAYS`) | back to login |
| 401 | `TOKEN_INVALID` | bad token / account deleted | back to login |
| 401 | `DEVICE_MISMATCH` | `X-Device-Id` missing or not the login device | back to login |
| 401 | `SESSION_ENDED` | a newer login happened, or admin changed password / banned / reset device / kicked | back to login |
| 403 | `BANNED` | banned (`reason` included) | show "banned" |
| 403 | `GAME_DISABLED` | the admin turned this game off (applies immediately to logged-in players) | show "this game is currently unavailable" |
| 403 | `BUILD_MISMATCH` | unrecognized game build (only once `ENFORCE_BUILD_CHECK` is on) | show "please update the game" |
| 403 | `NO_SUBSCRIPTION` / `SUBSCRIPTION_NOT_STARTED` / `SUBSCRIPTION_EXPIRED` | subscription problem (`startsAt`, `endsAt` included) | show "subscription expired, contact the admin" |

The subscription is checked on every request, so an account that expires while its token is still valid is stopped too.

Any 401 = call `/login` again (the player re-enters username + password).

Future endpoints (scores, etc.) use the same two headers.

---

## Admin (dashboard)

**Games** are stored in the database and managed from the dashboard. `GAMES` in the server `.env` is only a seed: games listed there are added once if missing (a game disabled or deleted from the dashboard stays that way). A new game works right away, no redeploy.

All admin requests except login need `Authorization: Bearer <adminToken>`.

Accounts have a `type`: `streamer` or `agency`. It decides which dashboard tab they appear in, and agency accounts do not need a subscription. Otherwise `/login`, `/session` and `/play` work the same for both.

`subscription.status` = `active` | `expired` | `not_started` | `none` (streamer without one) | `unlimited` (agency without one).

| Method | Path | Body / query | Does |
|---|---|---|---|
| POST | `/admin/login` | `{ password }` | returns `token` (ADMIN_PASSWORD from `.env`) |
| GET | `/admin/games` | | `games: [{ gameId, name, active, users, createdAt }]` (`users` = accounts on that game) |
| POST | `/admin/games` | `{ gameId, name }` | add a game (`gameId` 2–40 chars: lowercase letters, numbers, `-`; never changes). `409 GAME_EXISTS` |
| PATCH | `/admin/games/:gameId` | `{ name?, active? }` | rename (display only) / disable (`active: false`) / enable. `404 NOT_FOUND` |
| DELETE | `/admin/games/:gameId` | | delete, only if it has no accounts (`409 GAME_HAS_USERS` + `users`: disable it instead) |
| GET | `/admin/builds` | `?gameId=` | `{ enforced, builds: [{ _id, gameId, hash, label, createdAt }] }` — registered official build hashes |
| POST | `/admin/builds` | `{ gameId, hash, label }` | register a release's hash (`hash`: 40 or 64 hex chars, sha1/sha256). `409 BUILD_EXISTS` |
| DELETE | `/admin/builds/:id` | | revoke a hash (e.g. a leaked / outdated build) |
| POST | `/admin/users/:id/clear-build-alert` | | hide the "unrecognized build" alert on an account |
| GET | `/admin/stats` | `?gameId=&type=` | totals, logins today, not bound, banned, wrong-device tries (7 days), `expiringSoon` (7 days), `expiredSubs`, logins per day (14 days) |
| GET | `/admin/users` | `?type=&gameId=&search=&status=&page=&limit=` | list. `type` = `streamer` `agency`. `status` = `all` `bound` `unbound` `alerts` `banned` `expiring` (ends within 7 days) `expired` (ended, or streamer without a subscription). `search` = username or note |
| POST | `/admin/users` | `{ type, gameId, username, password, note, startsAt, months }` | create an account (`400 GAME_DISABLED` if the game is off). `type` = `streamer` (default) or `agency` (`409 USERNAME_TAKEN`). `startsAt` (ISO date) + `months` (1–12) required for streamers, optional for agency |
| POST | `/admin/users/:id/subscription` | `{ startsAt, months }` | set / renew the subscription. If `startsAt` is inside the current period (e.g. its last day), the months are added on top and the old start is kept. Does not log the player out |
| GET | `/admin/users/:id` | | account + last 20 login attempts |
| PATCH | `/admin/users/:id` | `{ note }` | edit note |
| POST | `/admin/users/:id/reset-device` | | unlock device (next login locks again) |
| POST | `/admin/users/:id/ban` | `{ reason }` | ban |
| POST | `/admin/users/:id/unban` | | unban |
| POST | `/admin/users/:id/password` | `{ newPassword }` | change password |
| POST | `/admin/users/:id/kick` | | invalidate current tokens |
| POST | `/admin/users/:id/clear-alert` | | hide the wrong-device alert |
| DELETE | `/admin/users/:id` | | delete account + its login history |

User object returned to admin:

```json
{
  "id": "...", "type": "streamer", "gameId": "flying-bird", "username": "streamer1", "note": "Ahmed - Twitch",
  "deviceId": "A1B2C3D4E5F6A7B8", "deviceBoundAt": "...",
  "lastLoginAt": "...", "lastLoginIp": "...", "lastSeenAt": "...", "sessionExpiresAt": "...",
  "wrongDevice": { "at": "...", "deviceId": "OTHER-PC" },
  "suspiciousBuild": { "at": "...", "hash": "a1b2c3..." },
  "subscription": { "status": "active", "startsAt": "...", "endsAt": "...", "daysLeft": 88 },
  "banned": false, "banReason": "", "bannedAt": null, "createdAt": "..."
}
```

---

## Health

`GET /health` (outside `/api`) → `{ "ok": true, "games": [...] }`
