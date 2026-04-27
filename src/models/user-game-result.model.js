const { pool } = require("../config/db");

const CREATE_TABLE = `
  CREATE TABLE IF NOT EXISTS user_game_results (
    id            INT AUTO_INCREMENT PRIMARY KEY,
    user_id       INT NOT NULL,
    puzzle_day    INT NOT NULL,
    won           TINYINT(1) NOT NULL DEFAULT 0,
    num_guesses   TINYINT NOT NULL,
    time_seconds  INT DEFAULT NULL,
    hints_used    TINYINT DEFAULT 0,
    played_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    UNIQUE KEY uk_user_puzzle (user_id, puzzle_day),
    FOREIGN KEY (user_id) REFERENCES users(id),
    KEY idx_puzzle_day (puzzle_day),
    KEY idx_played_at (played_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
`;

async function createTable() {
  await pool.execute(CREATE_TABLE);
  try {
    await pool.execute(
      `ALTER TABLE user_game_results ADD KEY idx_played_at (played_at)`
    );
  } catch { /* index already exists */ }
}

async function findByUserAndDay(userId, puzzleDay) {
  const [rows] = await pool.execute(
    "SELECT * FROM user_game_results WHERE user_id = ? AND puzzle_day = ?",
    [userId, puzzleDay]
  );
  return rows[0] || null;
}

/** Latest result with puzzle_day strictly less than `beforeDay` (sorted predecessor for incremental streak). */
async function findLatestBeforeDay(userId, beforeDay) {
  const [rows] = await pool.execute(
    "SELECT * FROM user_game_results WHERE user_id = ? AND puzzle_day < ? ORDER BY puzzle_day DESC LIMIT 1",
    [userId, beforeDay]
  );
  return rows[0] || null;
}

async function create(result) {
  const { user_id, puzzle_day, won, num_guesses, time_seconds, hints_used } = result;
  const [out] = await pool.execute(
    `INSERT INTO user_game_results (user_id, puzzle_day, won, num_guesses, time_seconds, hints_used)
     VALUES (?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       won = VALUES(won), num_guesses = VALUES(num_guesses),
       time_seconds = VALUES(time_seconds), hints_used = VALUES(hints_used)`,
    [user_id, puzzle_day, won ? 1 : 0, num_guesses, time_seconds ?? null, hints_used ?? 0]
  );
  return out;
}

async function getStatsByUser(userId) {
  const [rows] = await pool.execute(
    "SELECT * FROM user_game_results WHERE user_id = ? ORDER BY puzzle_day ASC",
    [userId]
  );
  return rows;
}

async function bulkCreate(userId, results) {
  if (!results || results.length === 0) return;

  const days = results.map((r) => r.puzzle_day);
  const dayPlaceholders = days.map(() => "?").join(",");
  const [puzzles] = await pool.execute(
    `SELECT day, set_at FROM ipl_daily_puzzles WHERE day IN (${dayPlaceholders})`,
    days
  );
  const dateMap = new Map(puzzles.map((p) => [p.day, p.set_at]));

  const values = results.map((r) => [
    userId,
    r.puzzle_day,
    r.won ? 1 : 0,
    r.num_guesses,
    r.time_seconds ?? null,
    r.hints_used ?? 0,
    dateMap.get(r.puzzle_day) ?? new Date(),
  ]);
  const placeholders = values.map(() => "(?, ?, ?, ?, ?, ?, ?)").join(", ");
  const flat = values.flat();
  await pool.execute(
    `INSERT INTO user_game_results (user_id, puzzle_day, won, num_guesses, time_seconds, hints_used, played_at)
     VALUES ${placeholders}
     ON DUPLICATE KEY UPDATE
       won = VALUES(won), num_guesses = VALUES(num_guesses),
       time_seconds = VALUES(time_seconds), hints_used = VALUES(hints_used)`,
    flat
  );
}

async function getTodayLeaderboard(puzzleDay) {
  const [rows] = await pool.execute(
    `SELECT ugr.user_id, u.email, ugr.num_guesses, ugr.time_seconds, ugr.hints_used
     FROM user_game_results ugr
     JOIN users u ON u.id = ugr.user_id
     WHERE ugr.puzzle_day = ? AND ugr.won = 1
     ORDER BY ugr.num_guesses ASC, ugr.time_seconds ASC, ugr.hints_used ASC
     LIMIT 50`,
    [puzzleDay]
  );
  return rows;
}

const POINTS_EXPR = `
  SUM(
    CASE WHEN ugr.won = 1
      THEN 100 + (7 - ugr.num_guesses) * 20
           + GREATEST(0, LEAST(100, ROUND((300 - COALESCE(ugr.time_seconds, 300)) / 3)))
      ELSE 0
    END
  )`;

async function getAllTimeLeaderboard() {
  const [rows] = await pool.execute(
    `SELECT
       ugr.user_id,
       u.email,
       SUM(ugr.won) AS games_won,
       ${POINTS_EXPR} AS points
     FROM user_game_results ugr
     JOIN users u ON u.id = ugr.user_id
     GROUP BY ugr.user_id, u.email
     HAVING games_won >= 1
     ORDER BY points DESC, games_won DESC
     LIMIT 50`
  );
  return rows;
}

async function getWeeklyLeaderboard() {
  const [rows] = await pool.execute(
    `SELECT
       ugr.user_id,
       u.email,
       SUM(ugr.won) AS games_won,
       ${POINTS_EXPR} AS points
     FROM user_game_results ugr
     JOIN users u ON u.id = ugr.user_id
     JOIN ipl_daily_puzzles p ON p.day = ugr.puzzle_day
     WHERE p.set_at >= DATE_SUB(CURDATE(), INTERVAL WEEKDAY(CURDATE()) DAY)
     GROUP BY ugr.user_id, u.email
     HAVING games_won >= 1
     ORDER BY points DESC, games_won DESC
     LIMIT 50`
  );
  return rows;
}

async function getLastWeekLeaderboard() {
  const [rows] = await pool.execute(
    `SELECT
       ugr.user_id,
       u.email,
       SUM(ugr.won) AS games_won,
       ${POINTS_EXPR} AS points
     FROM user_game_results ugr
     JOIN users u ON u.id = ugr.user_id
     JOIN ipl_daily_puzzles p ON p.day = ugr.puzzle_day
     WHERE p.set_at >= DATE_SUB(CURDATE(), INTERVAL WEEKDAY(CURDATE()) + 7 DAY)
       AND p.set_at <  DATE_SUB(CURDATE(), INTERVAL WEEKDAY(CURDATE()) DAY)
     GROUP BY ugr.user_id, u.email
     HAVING games_won >= 1
     ORDER BY points DESC, games_won DESC
     LIMIT 5`
  );
  return rows;
}

/** 1-based rank in last week's leaderboard, or null if user had no qualifying games. */
async function getLastWeekRankForUser(userId) {
  const [rows] = await pool.execute(
    `SELECT rnk FROM (
       SELECT user_id,
         ROW_NUMBER() OVER (ORDER BY points DESC, games_won DESC) AS rnk
       FROM (
         SELECT ugr.user_id,
           SUM(ugr.won) AS games_won,
           ${POINTS_EXPR} AS points
         FROM user_game_results ugr
         JOIN users u ON u.id = ugr.user_id
         JOIN ipl_daily_puzzles p ON p.day = ugr.puzzle_day
         WHERE p.set_at >= DATE_SUB(CURDATE(), INTERVAL WEEKDAY(CURDATE()) + 7 DAY)
           AND p.set_at < DATE_SUB(CURDATE(), INTERVAL WEEKDAY(CURDATE()) DAY)
         GROUP BY ugr.user_id, u.email
         HAVING games_won >= 1
       ) sub
     ) ranked
     WHERE user_id = ?`,
    [userId]
  );
  return rows[0]?.rnk != null ? Number(rows[0].rnk) : null;
}

async function getMonthlyLeaderboard() {
  const [rows] = await pool.execute(
    `SELECT
       ugr.user_id,
       u.email,
       SUM(ugr.won) AS games_won,
       ${POINTS_EXPR} AS points
     FROM user_game_results ugr
     JOIN users u ON u.id = ugr.user_id
     JOIN ipl_daily_puzzles p ON p.day = ugr.puzzle_day
     WHERE p.set_at >= DATE_FORMAT(CURDATE(), '%Y-%m-01')
     GROUP BY ugr.user_id, u.email
     HAVING games_won >= 1
     ORDER BY points DESC, games_won DESC
     LIMIT 50`
  );
  return rows;
}

module.exports = {
  createTable, findByUserAndDay, findLatestBeforeDay, create, getStatsByUser,
  bulkCreate, getTodayLeaderboard, getAllTimeLeaderboard,
  getWeeklyLeaderboard, getLastWeekLeaderboard, getLastWeekRankForUser, getMonthlyLeaderboard,
};
