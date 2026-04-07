const bcrypt = require("bcrypt");
const UserModel = require("../models/user.model");
const UserGameResultModel = require("../models/user-game-result.model");
const LivePuzzleStatsModel = require("../models/live-puzzle-stats.model");
const { signToken } = require("../middleware/auth");

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SALT_ROUNDS = 10;

async function register(req, res) {
  try {
    const { email, password, gameResult } = req.body;

    if (!email || !EMAIL_RE.test(email)) {
      return res.status(400).json({ success: false, message: "Valid email is required" });
    }
    if (!password || password.length < 6) {
      return res.status(400).json({ success: false, message: "Password must be at least 6 characters" });
    }

    const existing = await UserModel.findByEmail(email);
    if (existing) {
      return res.status(409).json({ success: false, message: "Email already registered" });
    }

    const hash = await bcrypt.hash(password, SALT_ROUNDS);
    const user = await UserModel.create(email, hash);
    const token = signToken(user.id);

    if (gameResult && typeof gameResult === "object") {
      try {
        await UserGameResultModel.create({
          user_id: user.id,
          puzzle_day: gameResult.puzzle_day,
          won: gameResult.won,
          num_guesses: gameResult.num_guesses,
          time_seconds: gameResult.time_seconds,
          hints_used: gameResult.hints_used,
        });
      } catch {
        /* non-critical — account was still created */
      }
    }

    if (req.body.baselineStats) {
      try {
        const b = req.body.baselineStats;
        await UserModel.setBaseline(user.id, {
          played: b.gamesPlayed || 0,
          won: b.gamesWon || 0,
          maxStreak: b.maxStreak || 0,
        });
      } catch { /* non-critical */ }
    }

    res.status(201).json({
      success: true,
      data: { token, user: { id: user.id, email: user.email } },
    });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, message: err.message });
  }
}

async function login(req, res) {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, message: "Email and password are required" });
    }

    const user = await UserModel.findByEmail(email);
    if (!user) {
      return res.status(401).json({ success: false, message: "Invalid email or password" });
    }

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      return res.status(401).json({ success: false, message: "Invalid email or password" });
    }

    const token = signToken(user.id);
    res.json({
      success: true,
      data: { token, user: { id: user.id, email: user.email } },
    });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, message: err.message });
  }
}

async function me(req, res) {
  try {
    const user = await UserModel.findById(req.userId);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }
    res.json({
      success: true,
      data: { id: user.id, email: user.email, createdAt: user.created_at },
    });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, message: err.message });
  }
}

module.exports = { register, login, me };
