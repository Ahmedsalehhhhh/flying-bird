const mongoose = require("mongoose");

// Official build hashes registered by the admin after each release.
// A request whose X-Build-Hash is not in here is flagged as suspicious (see builds.js + requireAuth.js).
const allowedBuildSchema = new mongoose.Schema(
  {
    gameId: { type: String, required: true, lowercase: true, trim: true },
    hash: { type: String, required: true, lowercase: true, trim: true }, // sha1/sha256 hex of the game's own .exe
    label: { type: String, default: "" }, // e.g. "v1.3.0 - 2026-11-10"
  },
  { timestamps: true, versionKey: false }
);

allowedBuildSchema.index({ gameId: 1, hash: 1 }, { unique: true });

module.exports = mongoose.model("AllowedBuild", allowedBuildSchema);
