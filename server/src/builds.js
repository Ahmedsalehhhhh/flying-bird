// In-memory allowlist of official build hashes per game, so /login, /session and /play
// do not need an extra query. Refreshed after every change made by the admin.
// Fine for ONE server process (same pattern as games.js and middleware/rateLimit.js).
const AllowedBuild = require("./models/AllowedBuild");

let byGame = new Map(); // gameId -> Set<hash>

async function load() {
  await refresh();
}

async function refresh() {
  const all = await AllowedBuild.find().lean();
  byGame = new Map();
  for (const b of all) {
    if (!byGame.has(b.gameId)) byGame.set(b.gameId, new Set());
    byGame.get(b.gameId).add(b.hash);
  }
}

/**
 * "ok"          -> hash is a registered official build
 * "no_hash"     -> the request sent no X-Build-Hash at all (old game build, or a tampered client hiding it)
 * "unrecognized"-> a hash was sent but it is not on the list (no build registered yet for this game, or a mismatch)
 */
function check(gameId, hash) {
  if (!hash) return "no_hash";
  const set = byGame.get(gameId);
  return set && set.has(hash) ? "ok" : "unrecognized";
}

function list(gameId) {
  return AllowedBuild.find(gameId ? { gameId } : {}).sort({ createdAt: -1 });
}

module.exports = { load, refresh, check, list };
