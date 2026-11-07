// Pure helpers (no database) so they are easy to test.

const USERNAME_RE = /^[a-zA-Z0-9_.-]{3,30}$/;
const GAME_ID_RE = /^[a-z0-9][a-z0-9-]{1,39}$/;
const DEVICE_RE = /^[a-zA-Z0-9-]{8,64}$/;

function validateUsername(username) {
  if (typeof username !== "string" || !USERNAME_RE.test(username.trim()))
    return "username must be 3-30 chars: letters, numbers, _ . -";
  return null;
}

function validatePassword(password) {
  if (typeof password !== "string" || password.length < 6 || password.length > 72)
    return "password must be 6-72 chars";
  return null;
}

function validateGameId(gameId) {
  if (typeof gameId !== "string" || !GAME_ID_RE.test(gameId))
    return "gameId must be 2-40 chars: lowercase letters, numbers, - (not starting with -)";
  return null;
}

function validateGameName(name) {
  if (typeof name !== "string" || !name.trim() || name.trim().length > 60) return "name must be 1-60 chars";
  return null;
}

function validateDeviceId(deviceId) {
  return typeof deviceId === "string" && DEVICE_RE.test(deviceId);
}

/**
 * Device lock decision for a login with the right password.
 *   "bind"  -> account has no device yet: lock it to this one
 *   "ok"    -> same device as the locked one
 *   "wrong" -> account is locked to another device
 */
function deviceDecision(boundDeviceId, deviceId) {
  if (!boundDeviceId) return "bind";
  return boundDeviceId === deviceId ? "ok" : "wrong";
}

// ---------------------------------------------------------------------------
// Subscriptions
// ---------------------------------------------------------------------------
const DAY_MS = 86400000;

/**
 * date + N calendar months (UTC). If the day does not exist in the target month,
 * use that month's last day: Jan 31 + 1 month -> Feb 28/29.
 * The dashboard uses the same logic for its preview (admin-dashboard/src/format.js).
 */
function addMonths(date, months) {
  const d = new Date(date);
  const day = d.getUTCDate();
  const r = new Date(d.getTime());
  r.setUTCDate(1);
  r.setUTCMonth(r.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(r.getUTCFullYear(), r.getUTCMonth() + 1, 0)).getUTCDate();
  r.setUTCDate(Math.min(day, lastDay));
  return r;
}

/** Subscription length: whole months 1-12. */
function validateMonths(months) {
  return Number.isInteger(months) && months >= 1 && months <= 12;
}

/** Date from the dashboard (ISO string). null if missing or not a sane date. */
function parseDate(value) {
  if (typeof value !== "string" || !value) return null;
  const d = new Date(value);
  if (isNaN(d.getTime())) return null;
  const y = d.getUTCFullYear();
  return y >= 2000 && y <= 2100 ? d : null;
}

/**
 *   "active"      -> inside the subscription period
 *   "unlimited"   -> agency account without a subscription (never expires)
 *   "none"        -> streamer without a subscription
 *   "not_started" -> start date is still in the future
 *   "expired"     -> end date passed
 */
function subscriptionStatus(user, now = new Date()) {
  const ends = user.subscriptionEndsAt;
  if (!ends) return user.type === "agency" ? "unlimited" : "none";
  if (user.subscriptionStartsAt && now < new Date(user.subscriptionStartsAt)) return "not_started";
  if (now >= new Date(ends)) return "expired";
  return "active";
}

const canPlay = (status) => status === "active" || status === "unlimited";

// Error code the game gets for each status that is not allowed to play.
const SUB_ERRORS = {
  none: { code: "NO_SUBSCRIPTION", message: "this account has no subscription" },
  not_started: { code: "SUBSCRIPTION_NOT_STARTED", message: "subscription has not started yet" },
  expired: { code: "SUBSCRIPTION_EXPIRED", message: "subscription expired" },
};

/** What the game / dashboard sees about the subscription. */
function subscriptionInfo(user, now = new Date()) {
  const status = subscriptionStatus(user, now);
  const ends = user.subscriptionEndsAt ? new Date(user.subscriptionEndsAt) : null;
  return {
    status,
    startsAt: user.subscriptionStartsAt || null,
    endsAt: ends,
    daysLeft: ends ? Math.max(0, Math.ceil((ends.getTime() - now.getTime()) / DAY_MS)) : null,
  };
}

/** Subscription object sent to the game: null when the account never expires. */
function gameSubscription(user, now = new Date()) {
  const info = subscriptionInfo(user, now);
  if (info.status === "unlimited") return null;
  return { startsAt: info.startsAt, endsAt: info.endsAt, daysLeft: info.daysLeft };
}

/**
 * New subscription dates when the admin sets / renews it.
 * If the new start falls inside the current period (e.g. renewing from its last day),
 * keep the old start and only move the end, so the remaining days are added on top
 * and the account never looks "not started".
 */
function applySubscription(current, startsAt, months) {
  const endsAt = addMonths(startsAt, months);
  const curStart = current && current.subscriptionStartsAt ? new Date(current.subscriptionStartsAt) : null;
  const curEnd = current && current.subscriptionEndsAt ? new Date(current.subscriptionEndsAt) : null;
  if (curStart && curEnd && startsAt >= curStart && startsAt <= curEnd) {
    return { subscriptionStartsAt: curStart, subscriptionEndsAt: endsAt };
  }
  return { subscriptionStartsAt: new Date(startsAt), subscriptionEndsAt: endsAt };
}

// ---------------------------------------------------------------------------
// Player session: lasts SESSION_DAYS from the last valid request (sliding)
// ---------------------------------------------------------------------------
const HOUR_MS = 3600000;

/** true when the session end date has passed. null = no date yet (tokens from before this feature). */
function sessionExpired(user, now = new Date()) {
  return !!user.sessionExpiresAt && now >= new Date(user.sessionExpiresAt);
}

/**
 * Push the end date forward only if it was last pushed more than an hour ago,
 * so pressing PLAY many times does not write to the database every time.
 */
function shouldExtendSession(user, now, sessionMs) {
  if (!user.sessionExpiresAt) return true;
  return new Date(user.sessionExpiresAt).getTime() - now.getTime() < sessionMs - HOUR_MS;
}

module.exports = {
  sessionExpired,
  shouldExtendSession,
  validateUsername,
  validatePassword,
  validateDeviceId,
  validateGameId,
  validateGameName,
  deviceDecision,
  addMonths,
  validateMonths,
  parseDate,
  subscriptionStatus,
  subscriptionInfo,
  gameSubscription,
  canPlay,
  SUB_ERRORS,
  applySubscription,
};
