const User = require("../models/User");
const { verifyPlayerToken, deviceHash } = require("../tokens");
const config = require("../config");
const games = require("../games");
const { subscriptionStatus, canPlay, SUB_ERRORS, sessionExpired, shouldExtendSession } = require("../rules");

const fail = (res, status, code, message, extra = {}) =>
  res.status(status).json({ ok: false, code, message, ...extra });

/**
 * Used by GET /api/session, POST /api/play, and by any future game endpoint that needs a logged-in streamer.
 * The game sends:
 *   Authorization: Bearer <token from /login>
 *   X-Device-Id:   <same deviceId used in /login>
 *
 * The session lasts SESSION_DAYS (30) after the last valid request: every request that passes
 * all checks pushes user.sessionExpiresAt forward (at most one database write per hour).
 *
 * Example (in index.js):
 *   const requireAuth = require("./middleware/requireAuth");
 *   app.post("/api/score", requireAuth, (req, res) => { req.user ... });
 */
module.exports = async function requireAuth(req, res, next) {
  const m = (req.headers.authorization || "").match(/^Bearer (.+)$/);
  if (!m) return fail(res, 401, "NO_TOKEN", "missing token");

  let payload;
  try {
    payload = verifyPlayerToken(m[1]);
  } catch (e) {
    // Only tokens from before sliding sessions still carry an "exp".
    if (e.name === "TokenExpiredError") return fail(res, 401, "TOKEN_EXPIRED", "token expired, call /login again");
    return fail(res, 401, "TOKEN_INVALID", "invalid token");
  }

  const deviceId = String(req.headers["x-device-id"] || "");
  if (!deviceId || payload.dh !== deviceHash(deviceId))
    return fail(res, 401, "DEVICE_MISMATCH", "token used from another device");

  try {
    const user = await User.findById(payload.sub);
    if (!user) return fail(res, 401, "TOKEN_INVALID", "account not found");
    if (user.banned) return fail(res, 403, "BANNED", "this account is banned", { reason: user.banReason || "" });
    if (games.isActive(user.gameId) !== "ok") return fail(res, 403, "GAME_DISABLED", "this game is disabled");
    const status = subscriptionStatus(user);
    if (!canPlay(status)) {
      const e = SUB_ERRORS[status];
      return fail(res, 403, e.code, e.message, {
        startsAt: user.subscriptionStartsAt || null,
        endsAt: user.subscriptionEndsAt || null,
      });
    }
    if ((user.tokenVersion || 0) !== payload.tv || user.deviceId !== deviceId)
      return fail(res, 401, "SESSION_ENDED", "please log in again");
    const now = new Date();
    if (sessionExpired(user, now))
      return fail(res, 401, "TOKEN_EXPIRED", "session expired, log in again");

    if (shouldExtendSession(user, now, config.sessionMs)) {
      const changes = { sessionExpiresAt: new Date(now.getTime() + config.sessionMs), lastSeenAt: now };
      // Only if the token is still the current one (a newer login at the same moment wins).
      await User.updateOne({ _id: user._id, tokenVersion: user.tokenVersion }, { $set: changes });
      Object.assign(user, changes);
    }

    req.user = user;
    next();
  } catch (e) {
    console.error(e);
    fail(res, 500, "SERVER_ERROR", "server error");
  }
};
