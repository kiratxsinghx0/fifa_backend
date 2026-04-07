const UserGameResultModel = require("../models/user-game-result.model");
const UserModel = require("../models/user.model");

function computeStats(rows) {
  const gamesPlayed = rows.length;
  const gamesWon = rows.filter((r) => r.won).length;

  let currentStreak = 0;
  let maxStreak = 0;
  let streak = 0;

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const prev = rows[i - 1];
    const isConsecutiveDay = prev ? r.puzzle_day === prev.puzzle_day + 1 : true;

    if (r.won && isConsecutiveDay) {
      streak++;
      if (streak > maxStreak) maxStreak = streak;
    } else if (r.won) {
      streak = 1;
      if (streak > maxStreak) maxStreak = streak;
    } else {
      streak = 0;
    }
  }
  currentStreak = streak;

  const distribution = [0, 0, 0, 0, 0, 0];
  for (const r of rows) {
    if (r.won && r.num_guesses >= 1 && r.num_guesses <= 6) {
      distribution[r.num_guesses - 1]++;
    }
  }

  return { gamesPlayed, gamesWon, currentStreak, maxStreak, distribution };
}

function mergeWithBaseline(stats, user) {
  const bp = user.baseline_played || 0;
  const bw = user.baseline_won || 0;
  const bms = user.baseline_max_streak || 0;

  if (bp <= stats.gamesPlayed) return stats;

  return {
    ...stats,
    gamesPlayed: Math.max(stats.gamesPlayed, bp),
    gamesWon: Math.max(stats.gamesWon, bw),
    maxStreak: Math.max(stats.maxStreak, bms),
  };
}

async function getMyStats(req, res) {
  try {
    const [rows, user] = await Promise.all([
      UserGameResultModel.getStatsByUser(req.userId),
      UserModel.findById(req.userId),
    ]);
    const stats = computeStats(rows);
    const merged = user ? mergeWithBaseline(stats, user) : stats;
    res.json({ success: true, data: merged });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, message: err.message });
  }
}

async function saveResult(req, res) {
  try {
    const { puzzle_day, won, num_guesses, time_seconds, hints_used } = req.body;

    if (puzzle_day == null || won == null || num_guesses == null) {
      return res.status(400).json({
        success: false,
        message: "puzzle_day, won, and num_guesses are required",
      });
    }

    const existing = await UserGameResultModel.findByUserAndDay(req.userId, puzzle_day);
    if (existing) {
      return res.json({ success: true, data: { alreadySaved: true } });
    }

    await UserGameResultModel.create({
      user_id: req.userId,
      puzzle_day,
      won,
      num_guesses,
      time_seconds: time_seconds ?? null,
      hints_used: hints_used ?? 0,
    });

    const [rows, user] = await Promise.all([
      UserGameResultModel.getStatsByUser(req.userId),
      UserModel.findById(req.userId),
    ]);
    const stats = computeStats(rows);
    const merged = user ? mergeWithBaseline(stats, user) : stats;

    res.status(201).json({ success: true, data: merged });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, message: err.message });
  }
}

module.exports = { getMyStats, saveResult };
