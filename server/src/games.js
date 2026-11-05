// In-memory list of games (from the database), so /login and every game request
// do not need an extra query. Refreshed after every change made by the admin.
// Fine for ONE server process (same as middleware/rateLimit.js).
const Game = require("./models/Game");
const config = require("./config");

let byId = new Map();

/** Load all games. Games listed in GAMES (.env) are added once if missing (seed only). */
async function load() {
  await Promise.all(
    [...config.games].map((gameId) =>
      Game.updateOne({ gameId }, { $setOnInsert: { gameId, name: gameId, active: true } }, { upsert: true })
    )
  );
  await refresh();
}

async function refresh() {
  const all = await Game.find().sort({ createdAt: 1 }).lean();
  byId = new Map(all.map((g) => [g.gameId, g]));
}

const get = (gameId) => byId.get(gameId) || null;
const list = () => [...byId.values()];

/** "ok" | "unknown" | "disabled" */
function isActive(gameId) {
  const g = byId.get(gameId);
  if (!g) return "unknown";
  return g.active ? "ok" : "disabled";
}

module.exports = { load, refresh, get, list, isActive };
