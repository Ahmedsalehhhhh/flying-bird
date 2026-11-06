require("dotenv").config();

const num = (v, def) => (Number(v) > 0 ? Number(v) : def);
const list = (v, def) =>
  (v || def)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

module.exports = {
  port: num(process.env.PORT, 3000),
  mongoUri: (process.env.MONGO_URI || "mongodb://127.0.0.1:27017").trim(),
  dbName: (process.env.MONGO_DB_NAME || "game_auth").trim(),
  games: new Set(list(process.env.GAMES, "flying-bird").map((g) => g.toLowerCase())),

  // Token returned by /login (for future game requests)
  jwtSecret: (process.env.JWT_SECRET || "").trim(),

  // Player session: ends after SESSION_DAYS without any valid request from the game.
  // Every valid request (/session, /play, ...) pushes the end date SESSION_DAYS forward.
  sessionMs: num(process.env.SESSION_DAYS, 30) * 86400000,

  // Brute-force protection for /login
  loginMaxAttempts: num(process.env.LOGIN_MAX_ATTEMPTS, 5),
  loginLockMs: num(process.env.LOGIN_LOCK_MIN, 15) * 60 * 1000,

  // How long login history is kept (days)
  loginLogDays: num(process.env.LOGIN_LOG_DAYS, 30),

  // Admin dashboard
  adminPassword: (process.env.ADMIN_PASSWORD || "").trim(),
  adminTokenHours: num(process.env.ADMIN_TOKEN_HOURS, 12),

  // Which websites may call this API from the browser (the admin dashboard).
  // "*" = any. Example: http://localhost:5173,https://admin.mygame.com
  corsOrigins: list(process.env.CORS_ORIGINS, "*"),

  // Build integrity check (X-Build-Hash header, see builds.js). Off by default: unrecognized
  // builds are only logged on the account (dashboard shows an alert), never rejected.
  // Turn on once the admin has registered the official build hash(es) for every live game.
  enforceBuildCheck: (process.env.ENFORCE_BUILD_CHECK || "").trim().toLowerCase() === "true",
};
