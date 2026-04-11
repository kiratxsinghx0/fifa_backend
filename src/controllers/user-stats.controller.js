const UserGameResultModel = require("../models/user-game-result.model");
const UserHardModeResultModel = require("../models/user-hard-mode-result.model");
const UserModel = require("../models/user.model");
const GameProgressModel = require("../models/ipl-game-progress.model");
const HardModeGameProgressModel = require("../models/ipl-hardmode-game-progress.model");
const IplDailyPuzzleModel = require("../models/ipl-daily-puzzle.model");
const IplHardmodeDailyPuzzleModel = require("../models/ipl-hardmode-daily-puzzle.model");

const LEADERBOARD_TTL = 3 * 60 * 1000;
const TODAY_CACHE_MAX_ENTRIES = 2;
const leaderboardCache = {
  allTime: null, allTimeExpiry: 0,
  weekly: null, weeklyExpiry: 0,
  monthly: null, monthlyExpiry: 0,
  today: new Map(),
  allTimeHard: null, allTimeHardExpiry: 0,
  weeklyHard: null, weeklyHardExpiry: 0,
  monthlyHard: null, monthlyHardExpiry: 0,
  todayHard: new Map(),
  hmEmails: new Map(),
};

const STATIC_TODAY = [
  { email: "rahul.sharma92",   num_guesses: 2, time_seconds: 45,  hints_used: 2 },
  { email: "arjun.mehta",      num_guesses: 3, time_seconds: 67,  hints_used: 3 },
  { email: "dipti1734",        num_guesses: 2, time_seconds: 52,  hints_used: 2 },
  { email: "amitsingh007",     num_guesses: 4, time_seconds: 89,  hints_used: 4 },
  { email: "vikram.iyer99",    num_guesses: 3, time_seconds: 71,  hints_used: 3 },
  { email: "rohan.kapoor",     num_guesses: 5, time_seconds: 120, hints_used: 5 },
  { email: "sneha.gupta21",    num_guesses: 2, time_seconds: 38,  hints_used: 2 },
  { email: "karan.desai",      num_guesses: 4, time_seconds: 95,  hints_used: 4 },
  { email: "suresh.pillai85",  num_guesses: 3, time_seconds: 58,  hints_used: 3 },
  { email: "aditya.joshi",     num_guesses: 5, time_seconds: 110, hints_used: 5 },
];

const STATIC_WEEKLY = [
  { email: "manish.tiwari",    games_won: 6, points: 1420 },
  { email: "deepak.verma91",   games_won: 5, points: 1180 },
  { email: "ananya.das",       games_won: 5, points: 1090 },
  { email: "sanjay.rao",       games_won: 4, points: 980  },
  { email: "nikhil.pandey07",  games_won: 4, points: 910  },
  { email: "harsh.chauhan",    games_won: 3, points: 760  },
  { email: "ravi.kumar55",     games_won: 3, points: 720  },
  { email: "ajay.saxena",      games_won: 3, points: 680  },
  { email: "pooja.nair85",     games_won: 2, points: 520  },
  { email: "tushar.bhatt",     games_won: 2, points: 460  },
];

const STATIC_MONTHLY = [
  { email: "gaurav.mishra",    games_won: 24, points: 5640 },
  { email: "mohit.aggarwal",   games_won: 22, points: 5180 },
  { email: "naveen.reddy01",   games_won: 20, points: 4720 },
  { email: "prateek.singh",    games_won: 19, points: 4390 },
  { email: "varun.khanna",     games_won: 18, points: 4100 },
  { email: "shruti.menon",     games_won: 17, points: 3850 },
  { email: "ashish.dubey77",   games_won: 16, points: 3620 },
  { email: "rajesh.nambiar",   games_won: 15, points: 3380 },
  { email: "kunal.dutta",      games_won: 14, points: 3100 },
  { email: "vivek.choudhary",  games_won: 13, points: 2840 },
];

const LEADERBOARD_PAD_TARGET = 10;

function padTodayBoard(board) {
  const needed = Math.max(0, LEADERBOARD_PAD_TARGET - board.length);
  if (needed === 0) return board;
  const fillers = STATIC_TODAY.slice(0, needed).map((p, i) => ({
    rank: board.length + i + 1,
    email: p.email,
    num_guesses: p.num_guesses,
    time_seconds: p.time_seconds,
    hints_used: p.hints_used,
    _filler: true,
  }));
  return [...board, ...fillers];
}

function padPeriodBoard(board, staticData) {
  const needed = Math.max(0, LEADERBOARD_PAD_TARGET - board.length);
  if (needed === 0) return board;
  const fillers = staticData.slice(0, needed).map((p, i) => ({
    rank: board.length + i + 1,
    email: p.email,
    games_won: p.games_won,
    points: p.points,
  }));
  return [...board, ...fillers];
}

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

    const wonBool = won === true || won === 1;
    const day = Number(puzzle_day);
    const guesses = Number(num_guesses);
    const timeSec = time_seconds != null ? Number(time_seconds) : null;
    const hints = Number(hints_used ?? 0);

    if (!Number.isInteger(day) || day < 1) {
      return res.status(400).json({ success: false, message: "Invalid puzzle_day" });
    }
    if (!Number.isInteger(guesses) || guesses < 1 || guesses > 6) {
      return res.status(400).json({ success: false, message: "num_guesses must be 1–6" });
    }
    if (timeSec != null && (!Number.isFinite(timeSec) || timeSec < 0)) {
      return res.status(400).json({ success: false, message: "Invalid time_seconds" });
    }
    if (!Number.isInteger(hints) || hints < 0) {
      return res.status(400).json({ success: false, message: "Invalid hints_used" });
    }

    const latestPuzzle = await IplDailyPuzzleModel.findLatest();
    if (!latestPuzzle || day > latestPuzzle.day) {
      return res.status(400).json({ success: false, message: "puzzle_day does not match any existing puzzle" });
    }

    const existing = await UserGameResultModel.findByUserAndDay(req.userId, day);
    if (existing) {
      let todayRank = 0;
      if (existing.won) {
        const user = await UserModel.findById(req.userId);
        if (user) {
          todayRank = spliceTodayCache(day, user.email, {
            num_guesses: existing.num_guesses,
            time_seconds: existing.time_seconds ?? 0,
            hints_used: existing.hints_used ?? 0,
          });
        }
      }
      return res.json({ success: true, data: { alreadySaved: true, todayRank } });
    }

    await UserGameResultModel.create({
      user_id: req.userId,
      puzzle_day: day,
      won: wonBool,
      num_guesses: guesses,
      time_seconds: timeSec,
      hints_used: hints,
    });

    GameProgressModel.markCompleted(req.userId, day).catch(() => {});

    const [rows, user] = await Promise.all([
      UserGameResultModel.getStatsByUser(req.userId),
      UserModel.findById(req.userId),
    ]);
    const stats = computeStats(rows);
    const merged = user ? mergeWithBaseline(stats, user) : stats;

    let todayRank = 0;
    if (wonBool && user) {
      todayRank = spliceTodayCache(day, user.email, {
        num_guesses: guesses,
        time_seconds: timeSec ?? 0,
        hints_used: hints,
      });
    }

    res.status(201).json({ success: true, data: { ...merged, todayRank } });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, message: err.message });
  }
}

const SYNC_MAX_RESULTS = 100;

async function syncResults(req, res) {
  try {
    const { results } = req.body;
    if (!Array.isArray(results) || results.length === 0) {
      return res.status(400).json({ success: false, message: "results array is required" });
    }
    if (results.length > SYNC_MAX_RESULTS) {
      return res.status(400).json({ success: false, message: `results array exceeds max of ${SYNC_MAX_RESULTS}` });
    }

    const seen = new Set();
    const valid = [];
    for (const r of results) {
      if (r.puzzle_day == null || r.won == null || r.num_guesses == null) continue;
      const day = Number(r.puzzle_day);
      const guesses = Number(r.num_guesses);
      if (!Number.isInteger(day) || day < 1) continue;
      if (!Number.isInteger(guesses) || guesses < 1 || guesses > 6) continue;
      if (seen.has(day)) continue;
      seen.add(day);
      valid.push({
        puzzle_day: day,
        won: r.won === true || r.won === 1,
        num_guesses: guesses,
        time_seconds: r.time_seconds != null ? Number(r.time_seconds) : null,
        hints_used: Number(r.hints_used ?? 0),
      });
    }
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

function maskEmail(email) {
  return email.split("@")[0];
}

function todaySortBefore(a, b) {
  if (a.num_guesses !== b.num_guesses) return a.num_guesses - b.num_guesses;
  const aTime = a.time_seconds ?? Infinity;
  const bTime = b.time_seconds ?? Infinity;
  if (aTime !== bTime) return aTime - bTime;
  return (a.hints_used ?? 0) - (b.hints_used ?? 0);
}

/**
 * Insert a winning result into the cached today board (if it exists).
 * Returns the user's 1-based rank, or 0 if no cache / didn't make top 10.
 */
function spliceTodayCache(puzzleDay, email, result) {
  const cached = leaderboardCache.today.get(puzzleDay);
  if (!cached) return 0;

  const masked = maskEmail(email);
  const board = cached.data;

  const existing = board.find((b) => !b._filler && b.email === masked);
  if (existing) return existing.rank;

  const entry = {
    rank: 0,
    email: masked,
    num_guesses: result.num_guesses,
    time_seconds: result.time_seconds ?? 0,
    hints_used: result.hints_used ?? 0,
  };

  let insertIdx = board.length;
  for (let i = 0; i < board.length; i++) {
    if (board[i]._filler || todaySortBefore(entry, board[i]) < 0) {
      insertIdx = i;
      break;
    }
  }

  if (insertIdx >= LEADERBOARD_PAD_TARGET) return 0;

  board.splice(insertIdx, 0, entry);
  if (board.length > LEADERBOARD_PAD_TARGET) board.length = LEADERBOARD_PAD_TARGET;
  for (let i = 0; i < board.length; i++) board[i].rank = i + 1;

  const STALE_REFRESH = 30 * 1000;
  const minExpiry = Date.now() + STALE_REFRESH;
  if (cached.expiry > minExpiry) {
    cached.expiry = minExpiry;
  }

  return insertIdx + 1;
}

async function todayLeaderboard(req, res) {
  try {
    const puzzleDay = parseInt(req.query.puzzle_day, 10);
    if (isNaN(puzzleDay)) {
      return res.status(400).json({ success: false, message: "puzzle_day query param is required" });
    }
    const now = Date.now();
    const cached = leaderboardCache.today.get(puzzleDay);
    if (cached && now < cached.expiry) {
      const hmSet = await getHmEmailSet(puzzleDay);
      return res.json({ success: true, data: tagHardMode(stripFillerFlag(cached.data), hmSet) });
    }
    const rows = await UserGameResultModel.getTodayLeaderboard(puzzleDay);
    const realBoard = rows.map((r, i) => ({
      rank: i + 1,
      email: maskEmail(r.email),
      num_guesses: r.num_guesses,
      time_seconds: r.time_seconds ?? 0,
      hints_used: r.hints_used ?? 0,
    }));
    const board = padTodayBoard(realBoard);
    leaderboardCache.today.set(puzzleDay, { data: board, expiry: now + LEADERBOARD_TTL });
    if (leaderboardCache.today.size > TODAY_CACHE_MAX_ENTRIES) {
      const oldest = leaderboardCache.today.keys().next().value;
      leaderboardCache.today.delete(oldest);
    }
    const hmSet = await getHmEmailSet(puzzleDay);
    res.json({ success: true, data: tagHardMode(stripFillerFlag(board), hmSet) });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, message: err.message });
  }
}

function stripFillerFlag(board) {
  return board.map(({ _filler, ...rest }) => rest);
}

function buildPeriodBoard(rows) {
  return rows.map((r, i) => ({
    rank: i + 1,
    email: maskEmail(r.email),
    games_won: Number(r.games_won),
    points: Number(r.points),
  }));
}

async function allTimeLeaderboard(req, res) {
  try {
    const now = Date.now();
    if (leaderboardCache.allTime && now < leaderboardCache.allTimeExpiry) {
      const puzzleDay = parseInt(req.query.puzzle_day, 10);
      if (puzzleDay) {
        const hmSet = await getHmEmailSet(puzzleDay);
        return res.json({ success: true, data: tagHardMode(leaderboardCache.allTime, hmSet) });
      }
      return res.json({ success: true, data: leaderboardCache.allTime });
    }
    const rows = await UserGameResultModel.getAllTimeLeaderboard();
    const board = buildPeriodBoard(rows);
    leaderboardCache.allTime = board;
    leaderboardCache.allTimeExpiry = now + LEADERBOARD_TTL;
    const puzzleDay = parseInt(req.query.puzzle_day, 10);
    if (puzzleDay) {
      const hmSet = await getHmEmailSet(puzzleDay);
      return res.json({ success: true, data: tagHardMode(board, hmSet) });
    }
    res.json({ success: true, data: board });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, message: err.message });
  }
}

async function weeklyLeaderboard(req, res) {
  try {
    const now = Date.now();
    if (leaderboardCache.weekly && now < leaderboardCache.weeklyExpiry) {
      const puzzleDay = parseInt(req.query.puzzle_day, 10);
      if (puzzleDay) {
        const hmSet = await getHmEmailSet(puzzleDay);
        return res.json({ success: true, data: tagHardMode(leaderboardCache.weekly, hmSet) });
      }
      return res.json({ success: true, data: leaderboardCache.weekly });
    }
    const rows = await UserGameResultModel.getWeeklyLeaderboard();
    const board = padPeriodBoard(buildPeriodBoard(rows), STATIC_WEEKLY);
    leaderboardCache.weekly = board;
    leaderboardCache.weeklyExpiry = now + LEADERBOARD_TTL;
    const puzzleDay = parseInt(req.query.puzzle_day, 10);
    if (puzzleDay) {
      const hmSet = await getHmEmailSet(puzzleDay);
      return res.json({ success: true, data: tagHardMode(board, hmSet) });
    }
    res.json({ success: true, data: board });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, message: err.message });
  }
}

async function monthlyLeaderboard(req, res) {
  try {
    const now = Date.now();
    if (leaderboardCache.monthly && now < leaderboardCache.monthlyExpiry) {
      const puzzleDay = parseInt(req.query.puzzle_day, 10);
      if (puzzleDay) {
        const hmSet = await getHmEmailSet(puzzleDay);
        return res.json({ success: true, data: tagHardMode(leaderboardCache.monthly, hmSet) });
      }
      return res.json({ success: true, data: leaderboardCache.monthly });
    }
    const rows = await UserGameResultModel.getMonthlyLeaderboard();
    const board = padPeriodBoard(buildPeriodBoard(rows), STATIC_MONTHLY);
    leaderboardCache.monthly = board;
    leaderboardCache.monthlyExpiry = now + LEADERBOARD_TTL;
    const puzzleDay = parseInt(req.query.puzzle_day, 10);
    if (puzzleDay) {
      const hmSet = await getHmEmailSet(puzzleDay);
      return res.json({ success: true, data: tagHardMode(board, hmSet) });
    }
    res.json({ success: true, data: board });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, message: err.message });
  }
}

/* ── Hard Mode helpers ── */

const HM_EMAILS_TTL = 3 * 60 * 1000;

async function getHmEmailSet(puzzleDay) {
  const now = Date.now();
  const cached = leaderboardCache.hmEmails.get(puzzleDay);
  if (cached && now < cached.expiry) return cached.set;
  const emails = await UserHardModeResultModel.getTodayHardModeEmails(puzzleDay);
  const set = new Set(emails.map((e) => maskEmail(e)));
  leaderboardCache.hmEmails.set(puzzleDay, { set, expiry: now + HM_EMAILS_TTL });
  if (leaderboardCache.hmEmails.size > 3) {
    const oldest = leaderboardCache.hmEmails.keys().next().value;
    leaderboardCache.hmEmails.delete(oldest);
  }
  return set;
}

function tagHardMode(board, hmSet) {
  return board.map((row) => ({
    ...row,
    is_hard_mode_today: hmSet.has(row.email),
  }));
}

/* ── Hard Mode save ── */

async function saveHardModeResult(req, res) {
  try {
    const { puzzle_day, won, num_guesses, time_seconds } = req.body;

    if (puzzle_day == null || won == null || num_guesses == null) {
      return res.status(400).json({
        success: false,
        message: "puzzle_day, won, and num_guesses are required",
      });
    }

    const wonBool = won === true || won === 1;
    const day = Number(puzzle_day);
    const guesses = Number(num_guesses);
    const timeSec = time_seconds != null ? Number(time_seconds) : null;

    if (!Number.isInteger(day) || day < 1) {
      return res.status(400).json({ success: false, message: "Invalid puzzle_day" });
    }
    if (!Number.isInteger(guesses) || guesses < 1 || guesses > 6) {
      return res.status(400).json({ success: false, message: "num_guesses must be 1–6" });
    }
    if (timeSec != null && (!Number.isFinite(timeSec) || timeSec < 0)) {
      return res.status(400).json({ success: false, message: "Invalid time_seconds" });
    }

    const latestHardPuzzle = await IplHardmodeDailyPuzzleModel.findLatest();
    if (!latestHardPuzzle || day > latestHardPuzzle.day) {
      return res.status(400).json({ success: false, message: "puzzle_day does not match any existing hard mode puzzle" });
    }

    const existing = await UserHardModeResultModel.findByUserAndDay(req.userId, day);
    if (existing) {
      let todayRank = 0;
      if (existing.won) {
        const user = await UserModel.findById(req.userId);
        if (user) {
          todayRank = spliceHardTodayCache(day, user.email, {
            num_guesses: existing.num_guesses,
            time_seconds: existing.time_seconds ?? 0,
          });
        }
      }
      return res.json({ success: true, data: { alreadySaved: true, todayRank } });
    }

    await UserHardModeResultModel.create({
      user_id: req.userId,
      puzzle_day: day,
      won: wonBool,
      num_guesses: guesses,
      time_seconds: timeSec,
    });

    HardModeGameProgressModel.markCompleted(req.userId, day).catch(() => {});
    leaderboardCache.hmEmails.delete(day);

    let todayRank = 0;
    if (wonBool) {
      const user = await UserModel.findById(req.userId);
      if (user) {
        todayRank = spliceHardTodayCache(day, user.email, {
          num_guesses: guesses,
          time_seconds: timeSec ?? 0,
        });
      }
    }

    res.status(201).json({ success: true, data: { todayRank } });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, message: err.message });
  }
}

function hardTodaySortBefore(a, b) {
  if (a.num_guesses !== b.num_guesses) return a.num_guesses - b.num_guesses;
  const aTime = a.time_seconds ?? Infinity;
  const bTime = b.time_seconds ?? Infinity;
  return aTime - bTime;
}

function spliceHardTodayCache(puzzleDay, email, result) {
  const cached = leaderboardCache.todayHard.get(puzzleDay);
  if (!cached) return 0;

  const masked = maskEmail(email);
  const board = cached.data;

  const existing = board.find((b) => b.email === masked);
  if (existing) return existing.rank;

  const entry = {
    rank: 0,
    email: masked,
    num_guesses: result.num_guesses,
    time_seconds: result.time_seconds ?? 0,
  };

  let insertIdx = board.length;
  for (let i = 0; i < board.length; i++) {
    if (hardTodaySortBefore(entry, board[i]) < 0) {
      insertIdx = i;
      break;
    }
  }

  if (insertIdx >= LEADERBOARD_PAD_TARGET) return 0;

  board.splice(insertIdx, 0, entry);
  if (board.length > LEADERBOARD_PAD_TARGET) board.length = LEADERBOARD_PAD_TARGET;
  for (let i = 0; i < board.length; i++) board[i].rank = i + 1;

  const STALE_REFRESH = 30 * 1000;
  const minExpiry = Date.now() + STALE_REFRESH;
  if (cached.expiry > minExpiry) {
    cached.expiry = minExpiry;
  }

  return insertIdx + 1;
}

/* ── Hard Mode leaderboards ── */

function buildHardTodayBoard(rows) {
  return rows.map((r, i) => ({
    rank: i + 1,
    email: maskEmail(r.email),
    num_guesses: r.num_guesses,
    time_seconds: r.time_seconds ?? 0,
  }));
}

async function todayHardModeLeaderboard(req, res) {
  try {
    const puzzleDay = parseInt(req.query.puzzle_day, 10);
    if (isNaN(puzzleDay)) {
      return res.status(400).json({ success: false, message: "puzzle_day query param is required" });
    }
    const now = Date.now();
    const cached = leaderboardCache.todayHard.get(puzzleDay);
    if (cached && now < cached.expiry) {
      return res.json({ success: true, data: cached.data });
    }
    const rows = await UserHardModeResultModel.getTodayLeaderboard(puzzleDay);
    const board = buildHardTodayBoard(rows);
    leaderboardCache.todayHard.set(puzzleDay, { data: board, expiry: now + LEADERBOARD_TTL });
    if (leaderboardCache.todayHard.size > TODAY_CACHE_MAX_ENTRIES) {
      const oldest = leaderboardCache.todayHard.keys().next().value;
      leaderboardCache.todayHard.delete(oldest);
    }
    res.json({ success: true, data: board });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, message: err.message });
  }
}

async function allTimeHardModeLeaderboard(_req, res) {
  try {
    const now = Date.now();
    if (leaderboardCache.allTimeHard && now < leaderboardCache.allTimeHardExpiry) {
      return res.json({ success: true, data: leaderboardCache.allTimeHard });
    }
    const rows = await UserHardModeResultModel.getAllTimeLeaderboard();
    const board = buildPeriodBoard(rows);
    leaderboardCache.allTimeHard = board;
    leaderboardCache.allTimeHardExpiry = now + LEADERBOARD_TTL;
    res.json({ success: true, data: board });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, message: err.message });
  }
}

async function weeklyHardModeLeaderboard(_req, res) {
  try {
    const now = Date.now();
    if (leaderboardCache.weeklyHard && now < leaderboardCache.weeklyHardExpiry) {
      return res.json({ success: true, data: leaderboardCache.weeklyHard });
    }
    const rows = await UserHardModeResultModel.getWeeklyLeaderboard();
    const board = buildPeriodBoard(rows);
    leaderboardCache.weeklyHard = board;
    leaderboardCache.weeklyHardExpiry = now + LEADERBOARD_TTL;
    res.json({ success: true, data: board });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, message: err.message });
  }
}

async function monthlyHardModeLeaderboard(_req, res) {
  try {
    const now = Date.now();
    if (leaderboardCache.monthlyHard && now < leaderboardCache.monthlyHardExpiry) {
      return res.json({ success: true, data: leaderboardCache.monthlyHard });
    }
    const rows = await UserHardModeResultModel.getMonthlyLeaderboard();
    const board = buildPeriodBoard(rows);
    leaderboardCache.monthlyHard = board;
    leaderboardCache.monthlyHardExpiry = now + LEADERBOARD_TTL;
    res.json({ success: true, data: board });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, message: err.message });
  }
}

/* ── Game Progress (save / restore mid-game state) ── */

const MAX_PROGRESS_JSON_SIZE = 10_000;

async function saveProgress(req, res) {
  try {
    const { puzzle_day, hard_mode, guesses_json, elapsed_seconds, hints_used, used_trivia_json, completed } = req.body;

    if (puzzle_day == null || guesses_json == null) {
      return res.status(400).json({ success: false, message: "puzzle_day and guesses_json are required" });
    }

    const day = Number(puzzle_day);
    if (!Number.isInteger(day) || day < 1) {
      return res.status(400).json({ success: false, message: "Invalid puzzle_day" });
    }

    const isHard = hard_mode === true || hard_mode === 1;
    const model = isHard ? HardModeGameProgressModel : GameProgressModel;

    const guessesStr = typeof guesses_json === "string" ? guesses_json : JSON.stringify(guesses_json);
    if (guessesStr.length > MAX_PROGRESS_JSON_SIZE) {
      return res.status(400).json({ success: false, message: "guesses_json payload too large" });
    }

    const payload = {
      user_id: req.userId,
      puzzle_day: day,
      guesses_json: guessesStr,
      elapsed_seconds: Number(elapsed_seconds) || 0,
      completed: completed === true || completed === 1,
    };

    if (!isHard) {
      payload.hints_used = Number(hints_used) || 0;
      const triviaStr = used_trivia_json != null
        ? (typeof used_trivia_json === "string" ? used_trivia_json : JSON.stringify(used_trivia_json))
        : null;
      if (triviaStr && triviaStr.length > MAX_PROGRESS_JSON_SIZE) {
        return res.status(400).json({ success: false, message: "used_trivia_json payload too large" });
      }
      payload.used_trivia_json = triviaStr;
    }

    await model.upsert(payload);
    res.json({ success: true });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, message: err.message });
  }
}

async function getProgress(req, res) {
  try {
    const puzzleDay = parseInt(req.query.puzzle_day, 10);
    if (isNaN(puzzleDay) || puzzleDay < 1) {
      return res.status(400).json({ success: false, message: "puzzle_day query param is required" });
    }

    const isHard = req.query.hard_mode === "1" || req.query.hard_mode === "true";
    const model = isHard ? HardModeGameProgressModel : GameProgressModel;

    const row = await model.findByUserAndDay(req.userId, puzzleDay);
    if (!row) {
      return res.json({ success: true, data: { found: false } });
    }

    const data = {
      found: true,
      completed: !!row.completed,
      guesses_json: row.guesses_json,
      elapsed_seconds: row.elapsed_seconds ?? 0,
    };

    if (!isHard) {
      data.hints_used = row.hints_used ?? 0;
      data.used_trivia_json = row.used_trivia_json ?? null;
    }

    return res.json({ success: true, data });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, message: err.message });
  }
}

/* ── Godmode & Preferences ── */

async function activateGodmode(req, res) {
  try {
    const latestHardPuzzle = await IplHardmodeDailyPuzzleModel.findLatest();
    if (!latestHardPuzzle) {
      return res.status(403).json({ success: false, message: "No hard mode puzzle available" });
    }

    const hmResult = await UserHardModeResultModel.findByUserAndDay(req.userId, latestHardPuzzle.day);
    if (!hmResult || !hmResult.won) {
      return res.status(403).json({ success: false, message: "Must win today's hard mode to unlock Godmode" });
    }

    const ts = Date.now();
    await UserModel.setGodmodeActivatedAt(req.userId, ts);
    res.json({ success: true, data: { godmode_activated_at: ts } });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, message: err.message });
  }
}

async function getPreferences(req, res) {
  try {
    const user = await UserModel.findById(req.userId);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }
    res.json({
      success: true,
      data: {
        godmode_activated_at: user.godmode_activated_at ?? null,
        hard_mode_pref: !!user.hard_mode_pref,
      },
    });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, message: err.message });
  }
}

async function updatePreferences(req, res) {
  try {
    const { hard_mode_pref } = req.body;
    if (hard_mode_pref != null) {
      await UserModel.setHardModePref(req.userId, hard_mode_pref === true || hard_mode_pref === 1);
    }
    res.json({ success: true });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, message: err.message });
  }
}

async function getMyHardModeStats(req, res) {
  try {
    const rows = await UserHardModeResultModel.getStatsByUser(req.userId);
    const stats = computeStats(rows);
    res.json({ success: true, data: stats });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, message: err.message });
  }
}

async function syncHardModeResults(req, res) {
  try {
    const { results } = req.body;
    if (!Array.isArray(results) || results.length === 0) {
      return res.status(400).json({ success: false, message: "results array is required" });
    }
    if (results.length > SYNC_MAX_RESULTS) {
      return res.status(400).json({ success: false, message: `results array exceeds max of ${SYNC_MAX_RESULTS}` });
    }

    const seen = new Set();
    const valid = [];
    for (const r of results) {
      if (r.puzzle_day == null || r.won == null || r.num_guesses == null) continue;
      const day = Number(r.puzzle_day);
      const guesses = Number(r.num_guesses);
      if (!Number.isInteger(day) || day < 1) continue;
      if (!Number.isInteger(guesses) || guesses < 1 || guesses > 6) continue;
      if (seen.has(day)) continue;
      seen.add(day);
      valid.push({
        puzzle_day: day,
        won: r.won === true || r.won === 1,
        num_guesses: guesses,
        time_seconds: r.time_seconds != null ? Number(r.time_seconds) : null,
      });
    }
    if (valid.length > 0) {
      await UserHardModeResultModel.bulkCreate(req.userId, valid);
    }

    const rows = await UserHardModeResultModel.getStatsByUser(req.userId);
    const stats = computeStats(rows);

    res.json({ success: true, data: stats, synced: valid.length });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, message: err.message });
  }
}

module.exports = {
  getMyStats, saveResult, syncResults,
  todayLeaderboard, allTimeLeaderboard,
  weeklyLeaderboard, monthlyLeaderboard,
  spliceTodayCache,
  saveHardModeResult, getMyHardModeStats, syncHardModeResults,
  todayHardModeLeaderboard, allTimeHardModeLeaderboard,
  weeklyHardModeLeaderboard, monthlyHardModeLeaderboard,
  saveProgress, getProgress,
  activateGodmode, getPreferences, updatePreferences,
};
