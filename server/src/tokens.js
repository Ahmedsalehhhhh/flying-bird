const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const config = require("./config");

const sha256 = (s) => crypto.createHash("sha256").update(String(s)).digest("hex");

// Short fingerprint of the device, stored inside the token.
const deviceHash = (deviceId) => sha256("device:" + deviceId).slice(0, 32);

// ---------- Player token (returned by /login) ----------
// Bound to the device (dh) and to the account's tokenVersion (tv),
// so a newer login / reset-device / ban / new password / kick make old tokens useless.
// No "exp": how long it lasts is decided by user.sessionExpiresAt in the database (sliding, SESSION_DAYS).
function signPlayerToken(user, deviceId) {
  return jwt.sign(
    { sub: String(user._id), game: user.gameId, name: user.username, dh: deviceHash(deviceId), tv: user.tokenVersion || 0 },
    config.jwtSecret,
    { audience: "player" }
  );
}

function verifyPlayerToken(token) {
  return jwt.verify(token, config.jwtSecret, { audience: "player" }); // throws on expired/invalid
}

// ---------- Admin token (dashboard) ----------
function signAdminToken() {
  return jwt.sign({ role: "admin" }, config.jwtSecret, {
    expiresIn: config.adminTokenHours * 3600,
    audience: "admin",
  });
}

function verifyAdminToken(token) {
  return jwt.verify(token, config.jwtSecret, { audience: "admin" });
}

// Compare secrets without leaking timing information.
function safeEqual(a, b) {
  const ha = crypto.createHash("sha256").update(String(a)).digest();
  const hb = crypto.createHash("sha256").update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

module.exports = {
  sha256,
  deviceHash,
  signPlayerToken,
  verifyPlayerToken,
  signAdminToken,
  verifyAdminToken,
  safeEqual,
};
