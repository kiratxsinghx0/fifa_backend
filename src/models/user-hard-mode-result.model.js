const { pool } = require("../config/db");

const CREATE_TABLE = `
  CREATE TABLE IF NOT EXISTS ipl_hardmode_user_results (
    id            INT AUTO_INCREMENT PRIMARY KEY,
    user_id       INT NOT NULL,
    puzzle_day    INT NOT NULL,
    won           TINYINT(1) NOT NULL DEFAULT 0,
    num_guesses   TINYINT NOT NULL,
    time_seconds  INT DEFAULT NULL,
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
      `ALTER TABLE ipl_hardmode_user_results ADD KEY idx_played_at (played_at)`
    );
  } catch { /* index already exists */ }
}

async function findByUserAndDay(userId, puzzleDay) {
  const [rows] = await pool.execute(
    "SELECT * FROM ipl_hardmode_user_results WHERE user_id = ? AND puzzle_day = ?",
    [userId, puzzleDay]
  );
  return rows[0] || null;
}

async function create(result) {
  const { user_id, puzzle_day, won, num_guesses, time_seconds } = result;
  const [out] = await pool.execute(
    `INSERT INTO ipl_hardmode_user_results (user_id, puzzle_day, won, num_guesses, time_seconds)
     VALUES (?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       won = VALUES(won), num_guesses = VALUES(num_guesses),
       time_seconds = VALUES(time_seconds)`,
    [user_id, puzzle_day, won ? 1 : 0, num_guesses, time_seconds ?? null]
  );
  return out;
}

async function getStatsByUser(userId) {
  const [rows] = await pool.execute(
    "SELECT * FROM ipl_hardmode_user_results WHERE user_id = ? ORDER BY puzzle_day ASC",
    [userId]
  );
  return rows;
}

async function bulkCreate(userId, results) {
  if (!results || results.length === 0) return;
  const values = results.map((r) => [
    userId,
    r.puzzle_day,
    r.won ? 1 : 0,
    r.num_guesses,
    r.time_seconds ?? null,
  ]);
  const placeholders = values.map(() => "(?, ?, ?, ?, ?)").join(", ");
  const flat = values.flat();
  await pool.execute(
    `INSERT INTO ipl_hardmode_user_results (user_id, puzzle_day, won, num_guesses, time_seconds)
     VALUES ${placeholders}
     ON DUPLICATE KEY UPDATE
       won = VALUES(won), num_guesses = VALUES(num_guesses),
       time_seconds = VALUES(time_seconds)`,
    flat
  );
}

async function getTodayLeaderboard(puzzleDay) {
  const [rows] = await pool.execute(
    `SELECT uhr.user_id, u.email, uhr.num_guesses, uhr.time_seconds
     FROM ipl_hardmode_user_results uhr
     JOIN users u ON u.id = uhr.user_id
     WHERE uhr.puzzle_day = ? AND uhr.won = 1
     ORDER BY uhr.num_guesses ASC, uhr.time_seconds ASC
     LIMIT 50`,
    [puzzleDay]
  );
  return rows;
}

const HARD_POINTS_EXPR = `
  SUM(
    CASE WHEN uhr.won = 1
      THEN 150 + (7 - uhr.num_guesses) * 30
           + GREATEST(0, LEAST(150, ROUND((300 - COALESCE(uhr.time_seconds, 300)) / 2)))
      ELSE 0
    END
  )`;

async function getAllTimeLeaderboard() {
  const [rows] = await pool.execute(
    `SELECT
       uhr.user_id,
       u.email,
       SUM(uhr.won) AS games_won,
       ${HARD_POINTS_EXPR} AS points
     FROM ipl_hardmode_user_results uhr
     JOIN users u ON u.id = uhr.user_id
     GROUP BY uhr.user_id, u.email
     HAVING games_won >= 1
     ORDER BY points DESC, games_won DESC
     LIMIT 50`
  );
  return rows;
}

async function getWeeklyLeaderboard() {
  const [rows] = await pool.execute(
    `SELECT
       uhr.user_id,
       u.email,
       SUM(uhr.won) AS games_won,
       ${HARD_POINTS_EXPR} AS points
     FROM ipl_hardmode_user_results uhr
     JOIN users u ON u.id = uhr.user_id
     WHERE uhr.played_at >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)
     GROUP BY uhr.user_id, u.email
     HAVING games_won >= 1
     ORDER BY points DESC, games_won DESC
     LIMIT 50`
  );
  return rows;
}

async function getMonthlyLeaderboard() {
  const [rows] = await pool.execute(
    `SELECT
       uhr.user_id,
       u.email,
       SUM(uhr.won) AS games_won,
       ${HARD_POINTS_EXPR} AS points
     FROM ipl_hardmode_user_results uhr
     JOIN users u ON u.id = uhr.user_id
     WHERE uhr.played_at >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
     GROUP BY uhr.user_id, u.email
     HAVING games_won >= 1
     ORDER BY points DESC, games_won DESC
     LIMIT 50`
  );
  return rows;
}

async function getTodayHardModeEmails(puzzleDay) {
  const [rows] = await pool.execute(
    `SELECT u.email
     FROM ipl_hardmode_user_results uhr
     JOIN users u ON u.id = uhr.user_id
     WHERE uhr.puzzle_day = ? AND uhr.won = 1`,
    [puzzleDay]
  );
  return rows.map((r) => r.email);
}

module.exports = {
  createTable, findByUserAndDay, create, getStatsByUser,
  bulkCreate, getTodayLeaderboard, getAllTimeLeaderboard,
  getWeeklyLeaderboard, getMonthlyLeaderboard, getTodayHardModeEmails,
};
