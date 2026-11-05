const test = require("node:test");
const assert = require("node:assert");
const {
  validateUsername,
  validatePassword,
  validateDeviceId,
  deviceDecision,
  addMonths,
  validateMonths,
  parseDate,
  subscriptionStatus,
  subscriptionInfo,
  applySubscription,
  sessionExpired,
  shouldExtendSession,
  validateGameId,
  validateGameName,
} = require("../src/rules");

const D = (s) => new Date(s);

test("username validation", () => {
  assert.strictEqual(validateUsername("streamer_01"), null);
  assert.strictEqual(validateUsername("ahmed.live"), null);
  assert.ok(validateUsername("ab"));
  assert.ok(validateUsername("bad name"));
  assert.ok(validateUsername(undefined));
});

test("password validation", () => {
  assert.strictEqual(validatePassword("123456"), null);
  assert.ok(validatePassword("123"));
  assert.ok(validatePassword(undefined));
});

test("deviceId validation", () => {
  assert.ok(validateDeviceId("a1b2c3d4-e5f6"));
  assert.ok(!validateDeviceId("x"));
  assert.ok(!validateDeviceId("8-64 chars"));
  assert.ok(!validateDeviceId(undefined));
});

test("first login binds the device", () => {
  assert.strictEqual(deviceDecision(null, "PC-AAAA1111"), "bind");
});

test("same device is allowed", () => {
  assert.strictEqual(deviceDecision("PC-AAAA1111", "PC-AAAA1111"), "ok");
});

test("another device is rejected", () => {
  assert.strictEqual(deviceDecision("PC-AAAA1111", "PC-BBBB2222"), "wrong");
});

test("addMonths adds calendar months", () => {
  assert.strictEqual(addMonths(D("2026-01-15T00:00:00Z"), 3).toISOString(), "2026-04-15T00:00:00.000Z");
  assert.strictEqual(addMonths(D("2026-11-05T22:00:00Z"), 2).toISOString(), "2027-01-05T22:00:00.000Z");
  assert.strictEqual(addMonths(D("2026-06-10T00:00:00Z"), 12).toISOString(), "2027-06-10T00:00:00.000Z");
});

test("addMonths clamps to the last day of the month", () => {
  assert.strictEqual(addMonths(D("2026-01-31T00:00:00Z"), 1).toISOString(), "2026-02-28T00:00:00.000Z");
  assert.strictEqual(addMonths(D("2028-01-31T00:00:00Z"), 1).toISOString(), "2028-02-29T00:00:00.000Z");
  assert.strictEqual(addMonths(D("2026-03-31T00:00:00Z"), 1).toISOString(), "2026-04-30T00:00:00.000Z");
});

test("months validation", () => {
  assert.ok(validateMonths(1));
  assert.ok(validateMonths(12));
  assert.ok(!validateMonths(0));
  assert.ok(!validateMonths(13));
  assert.ok(!validateMonths(2.5));
  assert.ok(!validateMonths("3"));
});

test("date parsing", () => {
  assert.ok(parseDate("2026-11-05T00:00:00.000Z"));
  assert.strictEqual(parseDate("nope"), null);
  assert.strictEqual(parseDate(""), null);
  assert.strictEqual(parseDate(undefined), null);
  assert.strictEqual(parseDate("1990-01-01"), null);
});

test("subscription status", () => {
  const now = D("2026-05-01T00:00:00Z");
  const sub = (starts, ends, type = "streamer") => ({
    type,
    subscriptionStartsAt: starts && D(starts),
    subscriptionEndsAt: ends && D(ends),
  });
  assert.strictEqual(subscriptionStatus(sub("2026-04-01", "2026-07-01"), now), "active");
  assert.strictEqual(subscriptionStatus(sub("2026-01-01", "2026-04-01"), now), "expired");
  assert.strictEqual(subscriptionStatus(sub("2026-01-01", "2026-05-01T00:00:00Z"), now), "expired");
  assert.strictEqual(subscriptionStatus(sub("2026-06-01", "2026-09-01"), now), "not_started");
  assert.strictEqual(subscriptionStatus(sub(null, null), now), "none");
  assert.strictEqual(subscriptionStatus({}, now), "none"); // old accounts without a type
  assert.strictEqual(subscriptionStatus(sub(null, null, "agency"), now), "unlimited");
  assert.strictEqual(subscriptionStatus(sub("2026-01-01", "2026-04-01", "agency"), now), "expired");
});

test("subscription info counts days left", () => {
  const now = D("2026-05-01T12:00:00Z");
  const info = subscriptionInfo({ subscriptionStartsAt: D("2026-04-01"), subscriptionEndsAt: D("2026-05-11T00:00:00Z") }, now);
  assert.strictEqual(info.status, "active");
  assert.strictEqual(info.daysLeft, 10);
  assert.strictEqual(subscriptionInfo({ type: "agency" }, now).daysLeft, null);
  assert.strictEqual(subscriptionInfo({ subscriptionEndsAt: D("2026-01-01") }, now).daysLeft, 0);
});

test("new subscription starts on the chosen date", () => {
  const r = applySubscription({}, D("2026-05-01T00:00:00Z"), 3);
  assert.strictEqual(r.subscriptionStartsAt.toISOString(), "2026-05-01T00:00:00.000Z");
  assert.strictEqual(r.subscriptionEndsAt.toISOString(), "2026-08-01T00:00:00.000Z");
});

test("renewing from the last day adds on top of the remaining days", () => {
  const current = { subscriptionStartsAt: D("2026-02-01T00:00:00Z"), subscriptionEndsAt: D("2026-05-11T00:00:00Z") };
  const r = applySubscription(current, D("2026-05-11T00:00:00Z"), 3);
  assert.strictEqual(r.subscriptionStartsAt.toISOString(), "2026-02-01T00:00:00.000Z"); // start kept
  assert.strictEqual(r.subscriptionEndsAt.toISOString(), "2026-08-11T00:00:00.000Z");
});

test("renewing after expiry starts a new period", () => {
  const current = { subscriptionStartsAt: D("2026-01-01T00:00:00Z"), subscriptionEndsAt: D("2026-02-01T00:00:00Z") };
  const r = applySubscription(current, D("2026-05-01T00:00:00Z"), 1);
  assert.strictEqual(r.subscriptionStartsAt.toISOString(), "2026-05-01T00:00:00.000Z");
  assert.strictEqual(r.subscriptionEndsAt.toISOString(), "2026-06-01T00:00:00.000Z");
});

test("session expiry", () => {
  const now = D("2026-05-01T00:00:00Z");
  assert.strictEqual(sessionExpired({ sessionExpiresAt: D("2026-05-20T00:00:00Z") }, now), false);
  assert.strictEqual(sessionExpired({ sessionExpiresAt: D("2026-04-30T00:00:00Z") }, now), true);
  assert.strictEqual(sessionExpired({ sessionExpiresAt: now }, now), true);
  assert.strictEqual(sessionExpired({ sessionExpiresAt: null }, now), false); // old tokens: JWT exp still applies
});

test("session is extended at most once an hour", () => {
  const DAY = 86400000;
  const MONTH = 30 * DAY;
  const now = D("2026-05-01T00:00:00Z");
  const at = (ms) => ({ sessionExpiresAt: new Date(now.getTime() + ms) });
  assert.strictEqual(shouldExtendSession({ sessionExpiresAt: null }, now, MONTH), true);
  assert.strictEqual(shouldExtendSession(at(MONTH), now, MONTH), false); // just logged in
  assert.strictEqual(shouldExtendSession(at(MONTH - 30 * 60000), now, MONTH), false); // 30 min ago
  assert.strictEqual(shouldExtendSession(at(MONTH - 2 * 3600000), now, MONTH), true); // 2 hours ago
  assert.strictEqual(shouldExtendSession(at(10 * DAY), now, MONTH), true); // idle for 20 days
});

test("gameId validation", () => {
  assert.strictEqual(validateGameId("flying-bird"), null);
  assert.strictEqual(validateGameId("game2"), null);
  assert.ok(validateGameId("a"));
  assert.ok(validateGameId("-bird"));
  assert.ok(validateGameId("Flying-Bird")); // lowercase only
  assert.ok(validateGameId("flying bird"));
  assert.ok(validateGameId("x".repeat(41)));
  assert.ok(validateGameId(undefined));
});

test("game name validation", () => {
  assert.strictEqual(validateGameName("Flying Bird"), null);
  assert.strictEqual(validateGameName("الطائر"), null);
  assert.ok(validateGameName("   "));
  assert.ok(validateGameName("x".repeat(61)));
  assert.ok(validateGameName(undefined));
});
