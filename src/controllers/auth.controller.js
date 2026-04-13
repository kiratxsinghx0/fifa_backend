const bcrypt = require("bcrypt");
const UserModel = require("../models/user.model");
const UserGameResultModel = require("../models/user-game-result.model");
const UserHardModeResultModel = require("../models/user-hard-mode-result.model");
const IplDailyPuzzleModel = require("../models/ipl-daily-puzzle.model");
const IplHardmodeDailyPuzzleModel = require("../models/ipl-hardmode-daily-puzzle.model");
const { signToken } = require("../middleware/auth");
const { spliceTodayCache, spliceHardTodayCache, invalidateGodmodeEmailCache } = require("./user-stats.controller");

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

    let godmodeActivatedAt = null;
    const isHardMode = gameResult?.hard_mode === true || gameResult?.hard_mode === 1;

    if (gameResult && typeof gameResult === "object") {
      try {
        const day = Number(gameResult.puzzle_day);
        const guesses = Number(gameResult.num_guesses);
        const wonBool = gameResult.won === true || gameResult.won === 1;
        const timeSec = gameResult.time_seconds != null ? Number(gameResult.time_seconds) : null;
        const hints = Number(gameResult.hints_used ?? 0);

        if (isHardMode) {
          const latestHardPuzzle = await IplHardmodeDailyPuzzleModel.findLatest();
          const isValid =
            Number.isInteger(day) && day >= 1 &&
            Number.isInteger(guesses) && guesses >= 1 && guesses <= 6 &&
            latestHardPuzzle && day <= latestHardPuzzle.day;

          if (isValid) {
            await UserHardModeResultModel.create({
              user_id: user.id,
              puzzle_day: day,
              won: wonBool,
              num_guesses: guesses,
              time_seconds: timeSec,
            });

            if (wonBool) {
              godmodeActivatedAt = Date.now();
              await UserModel.setGodmodeActivatedAt(user.id, godmodeActivatedAt);
              invalidateGodmodeEmailCache();
              spliceHardTodayCache(day, email, {
                num_guesses: guesses,
                time_seconds: timeSec ?? 0,
              });
            }
          }
        } else {
          const latestPuzzle = await IplDailyPuzzleModel.findLatest();
          const isValid =
            Number.isInteger(day) && day >= 1 &&
            Number.isInteger(guesses) && guesses >= 1 && guesses <= 6 &&
            latestPuzzle && day <= latestPuzzle.day;

          if (isValid) {
            await UserGameResultModel.create({
              user_id: user.id,
              puzzle_day: day,
              won: wonBool,
              num_guesses: guesses,
              time_seconds: timeSec,
              hints_used: hints,
            });

            if (wonBool) {
              spliceTodayCache(day, email, {
                num_guesses: guesses,
                time_seconds: timeSec ?? 0,
                hints_used: hints,
              });
            }
          }
        }
      } catch {
        /* non-critical — account was still created */
      }
    }

    if (req.body.baselineStats) {
      try {
        const b = req.body.baselineStats;
        await UserModel.setBaselinePerMode(user.id, {
          playedNormal: b.gamesPlayedNormal || b.gamesPlayed || 0,
          wonNormal: b.gamesWonNormal || b.gamesWon || 0,
          playedHard: b.gamesPlayedHard || 0,
          wonHard: b.gamesWonHard || 0,
        });
      } catch { /* non-critical */ }
    }

    res.status(201).json({
      success: true,
      data: {
        token,
        user: { id: user.id, email: user.email },
        godmode_activated_at: godmodeActivatedAt,
        hard_mode_pref: isHardMode,
      },
    });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, message: err.message });
  }
}

async function login(req, res) {
  try {
    const { email, password, gameResult } = req.body;

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

    if (req.body.baselineStats) {
      try {
        const b = req.body.baselineStats;
        await UserModel.mergeBaselinePerMode(user.id, {
          playedNormal: b.gamesPlayedNormal || b.gamesPlayed || 0,
          wonNormal: b.gamesWonNormal || b.gamesWon || 0,
          playedHard: b.gamesPlayedHard || 0,
          wonHard: b.gamesWonHard || 0,
        });
      } catch { /* non-critical */ }
    }

    let godmodeActivatedAt = user.godmode_activated_at ?? null;

    if (gameResult && typeof gameResult === "object") {
      try {
        const isHardMode = gameResult.hard_mode === true || gameResult.hard_mode === 1;
        const day = Number(gameResult.puzzle_day);
        const guesses = Number(gameResult.num_guesses);
        const wonBool = gameResult.won === true || gameResult.won === 1;
        const timeSec = gameResult.time_seconds != null ? Number(gameResult.time_seconds) : null;
        const hints = Number(gameResult.hints_used ?? 0);

        if (isHardMode) {
          const latestHardPuzzle = await IplHardmodeDailyPuzzleModel.findLatest();
          const isValid =
            Number.isInteger(day) && day >= 1 &&
            Number.isInteger(guesses) && guesses >= 1 && guesses <= 6 &&
            latestHardPuzzle && day <= latestHardPuzzle.day;

          if (isValid) {
            const existing = await UserHardModeResultModel.findByUserAndDay(user.id, day);
            if (!existing) {
              await UserHardModeResultModel.create({
                user_id: user.id,
                puzzle_day: day,
                won: wonBool,
                num_guesses: guesses,
                time_seconds: timeSec,
              });
            }

            if (wonBool) {
              godmodeActivatedAt = Date.now();
              await UserModel.setGodmodeActivatedAt(user.id, godmodeActivatedAt);
              invalidateGodmodeEmailCache();
              spliceHardTodayCache(day, email, {
                num_guesses: existing ? existing.num_guesses : guesses,
                time_seconds: existing ? (existing.time_seconds ?? 0) : (timeSec ?? 0),
              });
            }
          }
        } else {
          const latestPuzzle = await IplDailyPuzzleModel.findLatest();
          const isValid =
            Number.isInteger(day) && day >= 1 &&
            Number.isInteger(guesses) && guesses >= 1 && guesses <= 6 &&
            latestPuzzle && day <= latestPuzzle.day;

          if (isValid) {
            const existing = await UserGameResultModel.findByUserAndDay(user.id, day);
            if (!existing) {
              await UserGameResultModel.create({
                user_id: user.id,
                puzzle_day: day,
                won: wonBool,
                num_guesses: guesses,
                time_seconds: timeSec,
                hints_used: hints,
              });
            }

            if (wonBool) {
              spliceTodayCache(day, email, {
                num_guesses: existing ? existing.num_guesses : guesses,
                time_seconds: existing ? (existing.time_seconds ?? 0) : (timeSec ?? 0),
                hints_used: existing ? (existing.hints_used ?? 0) : hints,
              });
            }
          }
        }
      } catch { /* non-critical */ }
    }

    res.json({
      success: true,
      data: {
        token,
        user: { id: user.id, email: user.email },
        godmode_activated_at: godmodeActivatedAt,
        hard_mode_pref: !!user.hard_mode_pref,
      },
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
