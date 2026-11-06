const mongoose = require("mongoose");

// An account created by the admin and given to a streamer or an agency member.
const userSchema = new mongoose.Schema(
  {
    // "streamer" or "agency" (only decides which dashboard tab it shows in; login works the same)
    type: { type: String, enum: ["streamer", "agency"], default: "streamer" },
    gameId: { type: String, required: true, lowercase: true, trim: true },
    username: { type: String, required: true, lowercase: true, trim: true },
    password: { type: String, required: true }, // bcrypt hash
    note: { type: String, default: "" },         // e.g. streamer name / channel

    // Device lock: set on the first successful login, then only this device can log in.
    deviceId: { type: String, default: null },
    deviceBoundAt: { type: Date, default: null },

    // Bumped to invalidate all tokens (reset device, ban, new password, kick).
    tokenVersion: { type: Number, default: 0 },

    // Player session: ends at sessionExpiresAt; every valid game request pushes it SESSION_DAYS forward.
    sessionExpiresAt: { type: Date, default: null },
    lastSeenAt: { type: Date, default: null }, // last valid request from the game

    lastLoginAt: { type: Date, default: null },
    lastLoginIp: { type: String, default: "" },

    // Last time someone tried this account from ANOTHER device (shown as an alert).
    lastRejectedDeviceAt: { type: Date, default: null },
    lastRejectedDeviceId: { type: String, default: null },

    // Last request with a missing/unrecognized build hash (shown as an alert; see builds.js).
    lastSuspiciousBuildAt: { type: Date, default: null },
    lastSuspiciousBuildHash: { type: String, default: null }, // "(none)" when no header was sent at all

    // Subscription: streamers can only log in between these dates (set by the admin).
    // Agency accounts without dates never expire.
    subscriptionStartsAt: { type: Date, default: null },
    subscriptionEndsAt: { type: Date, default: null },

    banned: { type: Boolean, default: false },
    banReason: { type: String, default: "" },
    bannedAt: { type: Date, default: null },
  },
  { timestamps: true } // createdAt, updatedAt
);

// Same username can exist in different games, but only once per game.
userSchema.index({ gameId: 1, username: 1 }, { unique: true });
userSchema.index({ createdAt: -1 });
userSchema.index({ type: 1, createdAt: -1 });
userSchema.index({ subscriptionEndsAt: 1 });

module.exports = mongoose.model("User", userSchema);
