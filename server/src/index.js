const dns = require("dns");
const path = require("path");
const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const config = require("./config");
const games = require("./games");
const builds = require("./builds");
const authRoutes = require("./routes/auth");
const adminRoutes = require("./routes/admin");

if (config.jwtSecret.length < 32) {
  console.error("JWT_SECRET is missing or too short in .env (need 32+ chars).");
  console.error(`Generate one: node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`);
  process.exit(1);
}
if (!config.adminPassword) {
  console.warn("ADMIN_PASSWORD is not set in .env -> admin dashboard login is disabled.");
} else if (config.adminPassword.length < 10) {
  console.warn("ADMIN_PASSWORD is short. Use 10+ characters.");
}

// Some ISPs / Windows DNS refuse SRV lookups needed by "mongodb+srv://" -> use public DNS.
if (config.mongoUri.startsWith("mongodb+srv://")) {
  dns.setServers(["8.8.8.8", "1.1.1.1"]);
}

const app = express();
app.disable("x-powered-by");
app.set("trust proxy", 1);
app.use(cors({ origin: config.corsOrigins.includes("*") ? true : config.corsOrigins }));
app.use(express.json({ limit: "10kb" }));

app.get("/health", (_req, res) =>
  res.json({ ok: true, games: games.list().filter((g) => g.active).map((g) => g.gameId) }));
app.use("/api/admin", adminRoutes);
app.use("/api", authRoutes);

// Admin dashboard page (built from admin-dashboard with: npm run build:server)
const dashboardFile = path.join(__dirname, "..", "public", "index.html");
app.get("/", (_req, res) => res.redirect("/admin"));
app.get("/admin", (_req, res) => {
  res.set("Cache-Control", "no-store");
  res.set("X-Frame-Options", "DENY");
  res.sendFile(dashboardFile, (err) => err && res.status(404).send("Dashboard not built. Run: npm run build:server in admin-dashboard"));
});

mongoose
  .connect(config.mongoUri, { dbName: config.dbName })
  .then(async () => {
    console.log("MongoDB connected");
    await games.load(); // games from the database (+ GAMES from .env added once if missing)
    await builds.load(); // registered official build hashes
    app.listen(config.port, () =>
      console.log(`Auth server on port ${config.port} | games: ${games.list().map((g) => g.gameId + (g.active ? "" : " (disabled)")).join(", ")}`)
    );
  })
  .catch((e) => {
    console.error("MongoDB connection failed:", e.message);
    process.exit(1);
  });
