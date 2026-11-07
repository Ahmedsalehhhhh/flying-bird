const express = require("express");
const bcrypt = require("bcryptjs");
const User = require("../models/User");
const LoginEvent = require("../models/LoginEvent");
const config = require("../config");
const { createLimiter } = require("../middleware/rateLimit");
const { validateDeviceId, deviceDecision, subscriptionStatus, canPlay, SUB_ERRORS, gameSubscription } = require("../rules");
const { signPlayerToken } = require("../tokens");
const requireAuth = require("../middleware/requireAuth");
const games = require("../games");

const router = express.Router();

const fail = (res, status, code, message, extra = {}) =>
  res.status(status).json({ ok: false, code, message, ...extra });

const handle = (fn) => (req, res) =>
  fn(req, res).catch((e) => {
    console.error(e);
    fail(res, 500, "SERVER_ERROR", "server error");
  });

// Brute-force protection:
//   same IP + same username: LOGIN_MAX_ATTEMPTS wrong passwords -> locked LOGIN_LOCK_MIN
//   same IP, any usernames : 30 wrong passwords                 -> locked LOGIN_LOCK_MIN
const MIN = 60 * 1000;
const userLimiter = createLimiter({ max: config.loginMaxAttempts, windowMs: 15 * MIN, lockMs: config.loginLockMs });
const ipLimiter = createLimiter({ max: 30, windowMs: 15 * MIN, lockMs: config.loginLockMs });

const sessionInfo = (user) => ({ expiresAt: user.sessionExpiresAt });

// Save one login attempt to the history (never blocks the response).
function logAttempt(req, { user, username, ok, code, deviceId }) {
  LoginEvent.create({
    gameId: req.gameId,
    userId: user ? user._id : null,
    username,
    accountType: user ? user.type || "streamer" : "",
    ok,
    code: code || "",
    deviceId,
    ip: req.ip || "",
  }).catch((e) => console.error("login log failed:", e.message));
}

// ---------------------------------------------------------------------------
// POST /api/login  { gameId, username, password, deviceId }
//
//   First successful login locks the account to that deviceId.
//   After that, only the same deviceId can log in.
//   Every login gives a new token and ends the previous one.
//   The session lasts SESSION_DAYS (30) and every /session or /play call pushes it forward again.
//
//   200 { ok: true, message, token, session: { expiresAt }, subscription: { startsAt, endsAt, daysLeft } | null }
//   401 WRONG_CREDENTIALS  | 403 WRONG_DEVICE | 403 BANNED | 403 GAME_DISABLED | 429 TOO_MANY_ATTEMPTS
//   403 NO_SUBSCRIPTION | SUBSCRIPTION_NOT_STARTED | SUBSCRIPTION_EXPIRED
// ---------------------------------------------------------------------------
router.post("/login", handle(async (req, res) => {
  const gameId = String((req.body && req.body.gameId) || "").toLowerCase().trim();
  const gameState = games.isActive(gameId);
  if (gameState === "unknown") return fail(res, 400, "UNKNOWN_GAME", "unknown gameId");
  req.gameId = gameId;

  const { username, password, deviceId } = req.body;
  if (typeof username !== "string" || typeof password !== "string" || !username || !password)
    return fail(res, 400, "INVALID_INPUT", "username and password are required");
  if (!validateDeviceId(deviceId))
    return fail(res, 400, "INVALID_INPUT", "deviceId must be 8-64 chars: letters, numbers, -");

  const uname = username.toLowerCase().trim();
  const userKey = `${req.ip}|${gameId}|${uname}`;
  const ipKey = `ip:${req.ip}`;
  const locked = Math.max(userLimiter.lockedFor(userKey), ipLimiter.lockedFor(ipKey));
  if (locked)
    return fail(res, 429, "TOO_MANY_ATTEMPTS", `too many attempts, try again in ${locked}s`, { retryAfterSec: locked });

  // 1) username + password
  let user = await User.findOne({ gameId, username: uname });
  if (!user || !(await bcrypt.compare(password, user.password))) {
    userLimiter.fail(userKey);
    ipLimiter.fail(ipKey);
    logAttempt(req, { user, username: uname, ok: false, code: "WRONG_CREDENTIALS", deviceId });
    return fail(res, 401, "WRONG_CREDENTIALS", "invalid username or password");
  }
  userLimiter.reset(userKey);

  // game turned off by the admin (checked after the password, so it does not reveal anything)
  if (gameState === "disabled") {
    logAttempt(req, { user, username: uname, ok: false, code: "GAME_DISABLED", deviceId });
    return fail(res, 403, "GAME_DISABLED", "this game is disabled");
  }

  // 2) banned?
  if (user.banned) {
    logAttempt(req, { user, username: uname, ok: false, code: "BANNED", deviceId });
    return fail(res, 403, "BANNED", "this account is banned", { reason: user.banReason || "" });
  }

  // 3) subscription (checked before the device lock, so an expired account never binds a device)
  const subStatus = subscriptionStatus(user);
  if (!canPlay(subStatus)) {
    const e = SUB_ERRORS[subStatus];
    logAttempt(req, { user, username: uname, ok: false, code: e.code, deviceId });
    return fail(res, 403, e.code, e.message, {
      startsAt: user.subscriptionStartsAt || null,
      endsAt: user.subscriptionEndsAt || null,
    });
  }

  // 4) device lock
  const now = new Date();
  let decision = deviceDecision(user.deviceId, deviceId);

  if (decision === "bind") {
    // Atomic: only binds if still unbound (two devices at the same second -> only one wins).
    const bound = await User.findOneAndUpdate(
      { _id: user._id, deviceId: null },
      { $set: { deviceId, deviceBoundAt: now } },
      { new: true }
    );
    user = bound || (await User.findById(user._id));
    decision = deviceDecision(user.deviceId, deviceId) === "ok" ? "ok" : "wrong";
  }

  if (decision === "wrong") {
    await User.updateOne(
      { _id: user._id },
      { $set: { lastRejectedDeviceAt: now, lastRejectedDeviceId: deviceId } }
    );
    logAttempt(req, { user, username: uname, ok: false, code: "WRONG_DEVICE", deviceId });
    return fail(res, 403, "WRONG_DEVICE", "this account is locked to another device");
  }

  // 5) success
  // tokenVersion + 1 -> every token from earlier logins stops working (only the newest token is valid)
  user = await User.findByIdAndUpdate(
    user._id,
    {
      $set: {
        lastLoginAt: now,
        lastLoginIp: req.ip || "",
        lastSeenAt: now,
        sessionExpiresAt: new Date(now.getTime() + config.sessionMs),
      },
      $inc: { tokenVersion: 1 },
    },
    { new: true }
  );
  logAttempt(req, { user, username: uname, ok: true, deviceId });

  res.json({
    ok: true,
    message: "login successful",
    token: signPlayerToken(user, deviceId),
    session: sessionInfo(user),
    subscription: gameSubscription(user),
  });
}));

// ---------------------------------------------------------------------------
// GET /api/session
//   Headers:  Authorization: Bearer <token from /login>
//             X-Device-Id:   <same deviceId used in /login>
//
//   The game calls this every time it opens, to check the saved token is still good
//   (token, device, ban, subscription, session). A valid call pushes the session SESSION_DAYS forward.
//   200 { ok: true, message, user: { username, type }, session: { expiresAt }, subscription }  -> continue
//   401 NO_TOKEN | TOKEN_EXPIRED (no activity for SESSION_DAYS) | TOKEN_INVALID | DEVICE_MISMATCH | SESSION_ENDED  -> back to login
//   403 BANNED | GAME_DISABLED | NO_SUBSCRIPTION | SUBSCRIPTION_NOT_STARTED | SUBSCRIPTION_EXPIRED
// ---------------------------------------------------------------------------
router.get("/session", requireAuth, (req, res) => {
  res.json({
    ok: true,
    message: "session valid",
    user: { username: req.user.username, type: req.user.type || "streamer" },
    session: sessionInfo(req.user),
    subscription: gameSubscription(req.user),
  });
});

// ---------------------------------------------------------------------------
// POST /api/play   (no body)
//   Headers:  Authorization: Bearer <token from /login>
//             X-Device-Id:   <same deviceId used in /login>
//
//   The game calls this when the streamer presses PLAY / START.
//   200 { ok: true, message }  -> start the game
//   401 NO_TOKEN | TOKEN_EXPIRED (no activity for SESSION_DAYS) | TOKEN_INVALID | DEVICE_MISMATCH | SESSION_ENDED  -> back to login
//   403 BANNED | GAME_DISABLED | NO_SUBSCRIPTION | SUBSCRIPTION_NOT_STARTED | SUBSCRIPTION_EXPIRED
// ---------------------------------------------------------------------------
router.post("/play", requireAuth, (req, res) => {
  res.json({ ok: true, message: "ok to play", session: sessionInfo(req.user), subscription: gameSubscription(req.user) });
});

module.exports = router;
