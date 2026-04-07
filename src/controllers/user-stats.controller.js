const UserGameResultModel = require("../models/user-game-result.model");
const LivePuzzleStatsModel = require("../models/live-puzzle-stats.model");

function computeStats(rows) {
  const gamesPlayed = rows.length;
  const gamesWon = rows.filter((r) => r.won).length;

  let currentStreak = 0;
  let maxStreak = 0;
  let streak = 0;
  for (const r of rows) {
    if (r.won) {
      streak++;
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

async function getMyStats(req, res) {
  try {
    const rows = await UserGameResultModel.getStatsByUser(req.userId);
    const stats = computeStats(rows);
    res.json({ success: true, data: stats });
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

    await LivePuzzleStatsModel.increment(puzzle_day, won, num_guesses);

    const rows = await UserGameResultModel.getStatsByUser(req.userId);
    const stats = computeStats(rows);

    res.status(201).json({ success: true, data: stats });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, message: err.message });
  }
}

module.exports = { getMyStats, saveResult };
