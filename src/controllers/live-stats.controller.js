const LivePuzzleStatsModel = require("../models/live-puzzle-stats.model");
const IplDailyPuzzleModel = require("../models/ipl-daily-puzzle.model");

const rateLimitMap = new Map();
const RATE_WINDOW_MS = 60_000;
const RATE_MAX_PER_WINDOW = 5;
const PRUNE_INTERVAL_MS = 120_000;

setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of rateLimitMap) {
    if (now - entry.windowStart > RATE_WINDOW_MS) rateLimitMap.delete(ip);
  }
}, PRUNE_INTERVAL_MS).unref();

function isRateLimited(ip) {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now - entry.windowStart > RATE_WINDOW_MS) {
    rateLimitMap.set(ip, { windowStart: now, count: 1 });
    return false;
  }
  entry.count++;
  return entry.count > RATE_MAX_PER_WINDOW;
}

function formatStats(row) {
  if (!row) {
    return {
      puzzleDay: null,
      totalPlayed: 0,
      totalWon: 0,
      distribution: [0, 0, 0, 0, 0, 0],
    };
  }
  const totalWon = row.total_won;
  const pct = (v) => totalWon > 0 ? Math.round((v / totalWon) * 100) : 0;
  return {
    puzzleDay: row.puzzle_day,
    totalPlayed: row.total_played,
    totalWon,
    distribution: [
      pct(row.guess_1),
      pct(row.guess_2),
      pct(row.guess_3),
      pct(row.guess_4),
      pct(row.guess_5),
      pct(row.guess_6),
    ],
  };
}

async function getByDay(req, res) {
  try {
    const day = parseInt(req.params.day, 10);
    if (isNaN(day) || day < 1) {
      return res.status(400).json({ success: false, message: "Invalid day parameter" });
    }
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

    const day = Number(puzzle_day);
    const guesses = Number(num_guesses);
    const wonBool = won === true || won === 1;

    const ip = req.ip || req.connection?.remoteAddress || "unknown";
    if (isRateLimited(ip)) {
      return res.status(429).json({ success: false, message: "Too many requests" });
    }

    const latest = await IplDailyPuzzleModel.findLatest();
    if (!latest || latest.day !== day) {
      return res.status(400).json({ success: false, message: "Invalid puzzle day" });
    }

    if (guesses < 1 || guesses > 6) {
      return res.status(400).json({ success: false, message: "Invalid guess count" });
    }

    await LivePuzzleStatsModel.increment(day, wonBool, guesses);
    res.json({ success: true });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, message: err.message });
  }
}

async function incrementGameStart(req, res) {
  try {
    const { puzzle_day } = req.body;
    if (puzzle_day == null) {
      return res.status(400).json({ success: false, message: "puzzle_day is required" });
    }

    const day = Number(puzzle_day);
    const ip = req.ip || req.connection?.remoteAddress || "unknown";
    if (isRateLimited(ip)) {
      return res.status(429).json({ success: false, message: "Too many requests" });
    }

    const latest = await IplDailyPuzzleModel.findLatest();
    if (!latest || latest.day !== day) {
      return res.status(400).json({ success: false, message: "Invalid puzzle day" });
    }

    await LivePuzzleStatsModel.incrementGameStart(day);
    res.json({ success: true });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, message: err.message });
  }
}

module.exports = { getByDay, getLatest, incrementAnonymous, incrementGameStart };
