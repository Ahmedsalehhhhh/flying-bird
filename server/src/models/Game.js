const mongoose = require("mongoose");

// A game that can use this auth server. Managed from the admin dashboard.
// gameId never changes (it is stored on every account and sent by the game); name is just for display.
const gameSchema = new mongoose.Schema(
  {
    gameId: { type: String, required: true, unique: true, lowercase: true, trim: true },
    name: { type: String, required: true, trim: true },
    // false = nobody can log in or keep playing this game until it is turned on again.
    active: { type: Boolean, default: true },
  },
  { timestamps: true, versionKey: false }
);

module.exports = mongoose.model("Game", gameSchema);
