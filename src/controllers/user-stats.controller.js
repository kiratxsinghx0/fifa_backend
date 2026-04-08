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

async function syncResults(req, res) {
  try {
    const { results } = req.body;
    if (!Array.isArray(results) || results.length === 0) {
      return res.status(400).json({ success: false, message: "results array is required" });
    }

    const valid = results.filter(
      (r) => r.puzzle_day != null && r.won != null && r.num_guesses != null
    );
    if (valid.length > 0) {
      await UserGameResultModel.bulkCreate(req.userId, valid);
    }

    const [rows, user] = await Promise.all([
      UserGameResultModel.getStatsByUser(req.userId),
      UserModel.findById(req.userId),
    ]);
    const stats = computeStats(rows);
    const merged = user ? mergeWithBaseline(stats, user) : stats;

    res.json({ success: true, data: merged, synced: valid.length });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, message: err.message });
  }
}

async function todayLeaderboard(req, res) {
  try {
    const puzzleDay = parseInt(req.query.puzzle_day, 10);
    if (isNaN(puzzleDay)) {
      return res.status(400).json({ success: false, message: "puzzle_day query param is required" });
    }
    const rows = await UserGameResultModel.getTodayLeaderboard(puzzleDay);
    const board = rows.map((r, i) => ({
      rank: i + 1,
      email: r.email.replace(/(.{2})(.*)(@.*)/, "$1***$3"),
      num_guesses: r.num_guesses,
      time_seconds: r.time_seconds,
      hints_used: r.hints_used,
    }));
    res.json({ success: true, data: board });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, message: err.message });
  }
}

async function allTimeLeaderboard(_req, res) {
  try {
    const rows = await UserGameResultModel.getAllTimeLeaderboard();
    const board = rows.map((r, i) => ({
      rank: i + 1,
      email: r.email.replace(/(.{2})(.*)(@.*)/, "$1***$3"),
      games_played: r.games_played,
      games_won: r.games_won,
      win_pct: r.win_pct,
      avg_guesses: r.avg_guesses,
      avg_time: r.avg_time,
    }));
    res.json({ success: true, data: board });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, message: err.message });
  }
}

module.exports = { getMyStats, saveResult, syncResults, todayLeaderboard, allTimeLeaderboard };
