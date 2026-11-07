const express = require("express");
const bcrypt = require("bcryptjs");
const mongoose = require("mongoose");
const User = require("../models/User");
const LoginEvent = require("../models/LoginEvent");
const config = require("../config");
const requireAdmin = require("../middleware/requireAdmin");
const Game = require("../models/Game");
const games = require("../games");
const { createLimiter } = require("../middleware/rateLimit");
const { signAdminToken, safeEqual } = require("../tokens");
const {
  validateUsername,
  validatePassword,
  validateGameId,
  validateGameName,
  validateMonths,
  parseDate,
  subscriptionInfo,
  applySubscription,
} = require("../rules");

const router = express.Router();

const fail = (res, status, code, message) =>
  res.status(status).json({ ok: false, code, message });

const handle = (fn) => (req, res) =>
  fn(req, res).catch((e) => {
    console.error(e);
    fail(res, 500, "SERVER_ERROR", "server error");
  });

// ---------------------------------------------------------------------------
// POST /api/admin/login  { password }   (5 wrong tries per IP -> locked 5 minutes)
// ---------------------------------------------------------------------------
const adminLimiter = createLimiter({ max: 5, windowMs: 5 * 60 * 1000, lockMs: 5 * 60 * 1000 });

router.post("/login", (req, res) => {
  if (!config.adminPassword)
    return fail(res, 503, "ADMIN_DISABLED", "set ADMIN_PASSWORD in .env to enable the dashboard");

  const key = `admin:${req.ip}`;
  const locked = adminLimiter.lockedFor(key);
  if (locked) return fail(res, 429, "TOO_MANY_ATTEMPTS", `try again in ${locked}s`);

  const { password } = req.body || {};
  if (typeof password !== "string" || !safeEqual(password, config.adminPassword)) {
    adminLimiter.fail(key);
    return fail(res, 401, "WRONG_PASSWORD", "wrong admin password");
  }
  adminLimiter.reset(key);
  res.json({ ok: true, token: signAdminToken(), expiresIn: config.adminTokenHours * 3600 });
});

// Everything below needs the admin token.
router.use(requireAdmin);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const DAY = 86400000;
const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const dayKey = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

function toAdminUser(u) {
  return {
    id: String(u._id),
    type: u.type || "streamer",
    gameId: u.gameId,
    username: u.username,
    note: u.note || "",
    deviceId: u.deviceId || null,
    deviceBoundAt: u.deviceBoundAt || null,
    lastLoginAt: u.lastLoginAt || null,
    lastSeenAt: u.lastSeenAt || null,
    sessionExpiresAt: u.sessionExpiresAt || null,
    lastLoginIp: u.lastLoginIp || "",
    wrongDevice: u.lastRejectedDeviceAt ? { at: u.lastRejectedDeviceAt, deviceId: u.lastRejectedDeviceId } : null,
    subscription: subscriptionInfo(u),
    banned: !!u.banned,
    banReason: u.banReason || "",
    bannedAt: u.bannedAt || null,
    createdAt: u.createdAt,
  };
}

function gameFilter(req) {
  const g = String(req.query.gameId || "").toLowerCase().trim();
  return g && g !== "all" ? { gameId: g } : {};
}

// ?type=streamer | agency  (old accounts without a type count as streamers)
const TYPES = ["streamer", "agency"];
function typeOf(req) {
  const t = String(req.query.type || "").toLowerCase();
  return TYPES.includes(t) ? t : "";
}
function userTypeFilter(req) {
  const t = typeOf(req);
  if (t === "agency") return { type: "agency" };
  if (t === "streamer") return { type: { $ne: "agency" } };
  return {};
}
function eventTypeFilter(req) {
  const t = typeOf(req);
  if (t === "agency") return { accountType: "agency" };
  if (t === "streamer") return { accountType: { $ne: "agency" } };
  return {};
}

// Accounts that cannot play because of the subscription:
// end date passed, or a streamer that never got one (agency accounts without dates never expire).
const expiredFilter = (now) => ({
  $or: [{ subscriptionEndsAt: { $lte: now } }, { subscriptionEndsAt: null, type: { $ne: "agency" } }],
});
const EXPIRING_DAYS = 7;
const expiringFilter = (now) => ({
  subscriptionEndsAt: { $gt: now, $lte: new Date(now.getTime() + EXPIRING_DAYS * DAY) },
});

// { startsAt, months } from the request body -> { startsAt: Date, months } or an error message.
function readSubscription(body) {
  const startsAt = parseDate(body && body.startsAt);
  const months = Number(body && body.months);
  if (!startsAt) return { error: "startsAt must be a valid date" };
  if (!validateMonths(months)) return { error: "months must be a whole number 1-12" };
  return { startsAt, months };
}

async function findUserOr404(req, res) {
  if (!mongoose.isValidObjectId(req.params.id)) {
    fail(res, 404, "NOT_FOUND", "user not found");
    return null;
  }
  const user = await User.findById(req.params.id);
  if (!user) fail(res, 404, "NOT_FOUND", "user not found");
  return user;
}

async function update(req, res, changes, message) {
  if (!mongoose.isValidObjectId(req.params.id)) return fail(res, 404, "NOT_FOUND", "user not found");
  const user = await User.findByIdAndUpdate(req.params.id, changes, { new: true });
  if (!user) return fail(res, 404, "NOT_FOUND", "user not found");
  res.json({ ok: true, message, user: toAdminUser(user) });
}

// ---------------------------------------------------------------------------
// Games
// ---------------------------------------------------------------------------
const toAdminGame = (g, users = 0) => ({
  gameId: g.gameId,
  name: g.name,
  active: !!g.active,
  users,
  createdAt: g.createdAt,
});

async function userCountsByGame() {
  const rows = await User.aggregate([{ $group: { _id: "$gameId", n: { $sum: 1 } } }]);
  return new Map(rows.map((r) => [r._id, r.n]));
}

// GET /api/admin/games  -> [{ gameId, name, active, users, createdAt }]
router.get("/games", handle(async (_req, res) => {
  const counts = await userCountsByGame();
  res.json({ ok: true, games: games.list().map((g) => toAdminGame(g, counts.get(g.gameId) || 0)) });
}));

// POST /api/admin/games  { gameId, name }
router.post("/games", handle(async (req, res) => {
  const gameId = String((req.body && req.body.gameId) || "").toLowerCase().trim();
  const name = req.body && req.body.name;
  const err = validateGameId(gameId) || validateGameName(name);
  if (err) return fail(res, 400, "INVALID_INPUT", err);
  try {
    const game = await Game.create({ gameId, name: name.trim(), active: true });
    await games.refresh();
    res.status(201).json({ ok: true, message: "game created", game: toAdminGame(game) });
  } catch (e) {
    if (e.code === 11000) return fail(res, 409, "GAME_EXISTS", "a game with this gameId already exists");
    throw e;
  }
}));

// PATCH /api/admin/games/:gameId  { name?, active? }   (gameId itself never changes)
router.patch("/games/:gameId", handle(async (req, res) => {
  const changes = {};
  const body = req.body || {};
  if (body.name !== undefined) {
    const err = validateGameName(body.name);
    if (err) return fail(res, 400, "INVALID_INPUT", err);
    changes.name = body.name.trim();
  }
  if (body.active !== undefined) {
    if (typeof body.active !== "boolean") return fail(res, 400, "INVALID_INPUT", "active must be true or false");
    changes.active = body.active;
  }
  if (!Object.keys(changes).length) return fail(res, 400, "INVALID_INPUT", "send name and/or active");

  const game = await Game.findOneAndUpdate({ gameId: String(req.params.gameId).toLowerCase() }, { $set: changes }, { new: true });
  if (!game) return fail(res, 404, "NOT_FOUND", "game not found");
  await games.refresh();
  const users = await User.countDocuments({ gameId: game.gameId });
  const message = changes.active === false ? "game disabled" : changes.active === true ? "game enabled" : "game saved";
  res.json({ ok: true, message, game: toAdminGame(game, users) });
}));

// DELETE /api/admin/games/:gameId   -> only when it has no accounts (otherwise disable it)
router.delete("/games/:gameId", handle(async (req, res) => {
  const gameId = String(req.params.gameId).toLowerCase();
  const game = await Game.findOne({ gameId });
  if (!game) return fail(res, 404, "NOT_FOUND", "game not found");
  const users = await User.countDocuments({ gameId });
  if (users) {
    return res.status(409).json({
      ok: false,
      code: "GAME_HAS_USERS",
      message: "this game still has accounts: disable it instead, or delete its accounts first",
      users,
    });
  }
  await Game.deleteOne({ _id: game._id });
  await games.refresh();
  res.json({ ok: true, message: "game deleted" });
}));

// ---------------------------------------------------------------------------
// GET /api/admin/stats?gameId=&type=streamer|agency
// ---------------------------------------------------------------------------
router.get("/stats", handle(async (req, res) => {
  const base = { ...gameFilter(req), ...userTypeFilter(req) };
  const eventBase = { ...gameFilter(req), ...eventTypeFilter(req) };
  const now = new Date();
  const today = startOfDay(now);
  const weekAgo = new Date(today.getTime() - 6 * DAY);

  const [totalUsers, loggedInToday, notBound, bannedUsers, wrongDeviceAttempts, expiringSoon, expiredSubs] = await Promise.all([
    User.countDocuments(base),
    User.countDocuments({ ...base, lastLoginAt: { $gte: today } }),
    User.countDocuments({ ...base, deviceId: null }),
    User.countDocuments({ ...base, banned: true }),
    LoginEvent.countDocuments({ ...eventBase, code: "WRONG_DEVICE", at: { $gte: weekAgo } }),
    User.countDocuments({ ...base, ...expiringFilter(now) }),
    User.countDocuments({ ...base, ...expiredFilter(now) }),
  ]);

  // Successful logins per day, last 14 days (oldest first)
  const days = [];
  for (let i = 13; i >= 0; i--) days.push(new Date(today.getTime() - i * DAY));
  const counts = await Promise.all(
    days.map((d) => LoginEvent.countDocuments({ ...eventBase, ok: true, at: { $gte: d, $lt: new Date(d.getTime() + DAY) } }))
  );
  const loginsPerDay = days.map((d, i) => ({ date: dayKey(d), count: counts[i] }));

  const allGames = games.list();
  const perGameCounts = await Promise.all(allGames.map((g) => User.countDocuments({ ...userTypeFilter(req), gameId: g.gameId })));
  const perGame = allGames.map((g, i) => ({ gameId: g.gameId, name: g.name, active: !!g.active, users: perGameCounts[i] }));

  res.json({
    ok: true,
    stats: { totalUsers, loggedInToday, notBound, bannedUsers, wrongDeviceAttempts, expiringSoon, expiredSubs, loginsPerDay, perGame },
  });
}));

// ---------------------------------------------------------------------------
// GET /api/admin/users?type=streamer|agency&gameId=&search=&status=all|bound|unbound|banned|alerts|expired|expiring&page=&limit=
// ---------------------------------------------------------------------------
router.get("/users", handle(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
  const search = String(req.query.search || "").trim();
  const status = String(req.query.status || "all");

  const filter = { ...gameFilter(req), ...userTypeFilter(req) };
  if (search) {
    const rx = { $regex: escapeRegex(search), $options: "i" };
    filter.$or = [{ username: rx }, { note: rx }];
  }
  if (status === "bound") filter.deviceId = { $ne: null };
  if (status === "unbound") filter.deviceId = null;
  if (status === "banned") filter.banned = true;
  if (status === "alerts") filter.lastRejectedDeviceAt = { $ne: null };
  if (status === "expired") filter.$and = [expiredFilter(new Date())];
  if (status === "expiring") Object.assign(filter, expiringFilter(new Date()));

  const [total, users] = await Promise.all([
    User.countDocuments(filter),
    User.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
  ]);

  res.json({
    ok: true,
    page,
    limit,
    total,
    pages: Math.max(1, Math.ceil(total / limit)),
    users: users.map(toAdminUser),
  });
}));

// ---------------------------------------------------------------------------
// POST /api/admin/users  { type, gameId, username, password, note, startsAt, months }
//   -> create an account (type: streamer | agency)
//   startsAt (ISO date) + months (1-12): required for streamers, optional for agency accounts.
// ---------------------------------------------------------------------------
router.post("/users", handle(async (req, res) => {
  const { username, password, note } = req.body || {};
  const type = String((req.body && req.body.type) || "streamer").toLowerCase();
  if (!TYPES.includes(type)) return fail(res, 400, "INVALID_INPUT", "type must be streamer or agency");
  const gameId = String((req.body && req.body.gameId) || "").toLowerCase().trim();
  const gameState = games.isActive(gameId);
  if (gameState === "unknown") return fail(res, 400, "UNKNOWN_GAME", "unknown gameId");
  if (gameState === "disabled") return fail(res, 400, "GAME_DISABLED", "this game is disabled: enable it first");
  const err = validateUsername(username) || validatePassword(password);
  if (err) return fail(res, 400, "INVALID_INPUT", err);

  let subscription = {};
  const hasSub = req.body.startsAt != null || req.body.months != null;
  if (type === "streamer" || hasSub) {
    const s = readSubscription(req.body);
    if (s.error) return fail(res, 400, "INVALID_INPUT", s.error);
    subscription = applySubscription(null, s.startsAt, s.months);
  }

  try {
    const user = await User.create({
      type,
      gameId,
      username: username.trim(),
      password: await bcrypt.hash(password, 10),
      note: String(note || "").slice(0, 200),
      ...subscription,
    });
    res.status(201).json({ ok: true, message: "account created", user: toAdminUser(user) });
  } catch (e) {
    if (e.code === 11000) return fail(res, 409, "USERNAME_TAKEN", "username already taken");
    throw e;
  }
}));

// ---------------------------------------------------------------------------
// GET /api/admin/users/:id   -> user + last 20 login attempts
// ---------------------------------------------------------------------------
router.get("/users/:id", handle(async (req, res) => {
  const user = await findUserOr404(req, res);
  if (!user) return;
  const logins = await LoginEvent.find({ userId: user._id }).sort({ at: -1 }).limit(20);
  res.json({
    ok: true,
    user: toAdminUser(user),
    logins: logins.map((l) => ({ at: l.at, ok: l.ok, code: l.code, deviceId: l.deviceId, ip: l.ip })),
  });
}));

// PATCH /api/admin/users/:id  { note }
router.patch("/users/:id", handle((req, res) =>
  update(req, res, { $set: { note: String((req.body && req.body.note) || "").slice(0, 200) } }, "note saved")));

// POST /api/admin/users/:id/reset-device  -> next login from any device locks it again
router.post("/users/:id/reset-device", handle((req, res) =>
  update(req, res, {
    $set: { deviceId: null, deviceBoundAt: null, lastRejectedDeviceAt: null, lastRejectedDeviceId: null },
    $inc: { tokenVersion: 1 },
  }, "device reset")));

// POST /api/admin/users/:id/kick  -> old tokens stop working (must /login again)
router.post("/users/:id/kick", handle((req, res) =>
  update(req, res, { $inc: { tokenVersion: 1 } }, "tokens revoked")));

// POST /api/admin/users/:id/ban  { reason }
router.post("/users/:id/ban", handle((req, res) =>
  update(req, res, {
    $set: { banned: true, banReason: String((req.body && req.body.reason) || "").slice(0, 200), bannedAt: new Date() },
    $inc: { tokenVersion: 1 },
  }, "account banned")));

// POST /api/admin/users/:id/unban
router.post("/users/:id/unban", handle((req, res) =>
  update(req, res, { $set: { banned: false, banReason: "", bannedAt: null } }, "account unbanned")));

// POST /api/admin/users/:id/password  { newPassword }
router.post("/users/:id/password", handle(async (req, res) => {
  const { newPassword } = req.body || {};
  const err = validatePassword(newPassword);
  if (err) return fail(res, 400, "INVALID_INPUT", err);
  return update(req, res, { $set: { password: await bcrypt.hash(newPassword, 10) }, $inc: { tokenVersion: 1 } }, "password changed");
}));

// POST /api/admin/users/:id/subscription  { startsAt, months }
//   Set / renew the subscription. If startsAt is inside the current period (e.g. its last day),
//   the months are added on top of the remaining days. Does not log the player out.
router.post("/users/:id/subscription", handle(async (req, res) => {
  const s = readSubscription(req.body);
  if (s.error) return fail(res, 400, "INVALID_INPUT", s.error);
  const user = await findUserOr404(req, res);
  if (!user) return;
  return update(req, res, { $set: applySubscription(user, s.startsAt, s.months) }, "subscription saved");
}));

// POST /api/admin/users/:id/clear-alert  -> hide the "wrong device" alert
router.post("/users/:id/clear-alert", handle((req, res) =>
  update(req, res, { $set: { lastRejectedDeviceAt: null, lastRejectedDeviceId: null } }, "alert cleared")));

// DELETE /api/admin/users/:id
router.delete("/users/:id", handle(async (req, res) => {
  const user = await findUserOr404(req, res);
  if (!user) return;
  await Promise.all([User.deleteOne({ _id: user._id }), LoginEvent.deleteMany({ userId: user._id })]);
  res.json({ ok: true, message: "account deleted" });
}));

module.exports = router;
