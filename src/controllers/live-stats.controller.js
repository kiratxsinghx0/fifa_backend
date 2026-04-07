const LivePuzzleStatsModel = require("../models/live-puzzle-stats.model");

function formatStats(row) {
  if (!row) {
    return {
      puzzleDay: null,
      totalPlayed: 0,
      totalWon: 0,
      distribution: [0, 0, 0, 0, 0, 0],
    };
  }
  const totalWon = row.total_won || 1;
  return {
    puzzleDay: row.puzzle_day,
    totalPlayed: row.total_played,
    totalWon: row.total_won,
    distribution: [
      Math.round((row.guess_1 / totalWon) * 100),
      Math.round((row.guess_2 / totalWon) * 100),
      Math.round((row.guess_3 / totalWon) * 100),
      Math.round((row.guess_4 / totalWon) * 100),
      Math.round((row.guess_5 / totalWon) * 100),
      Math.round((row.guess_6 / totalWon) * 100),
    ],
  };
}

async function getByDay(req, res) {
  try {
    const day = parseInt(req.params.day, 10);
    const row = await LivePuzzleStatsModel.findByDay(day);
    res.json({ success: true, data: formatStats(row) });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, message: err.message });
  }
}

async function getLatest(req, res) {
  try {
    const row = await LivePuzzleStatsModel.findLatestDay();
    res.json({ success: true, data: formatStats(row) });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, message: err.message });
  }
}

async function incrementAnonymous(req, res) {
  try {
    const { puzzle_day, won, num_guesses } = req.body;
    if (puzzle_day == null || won == null || num_guesses == null) {
      return res.status(400).json({
        success: false,
        message: "puzzle_day, won, and num_guesses are required",
      });
    }
    await LivePuzzleStatsModel.increment(puzzle_day, won, num_guesses);
    res.json({ success: true });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, message: err.message });
  }
}

module.exports = { getByDay, getLatest, incrementAnonymous };
