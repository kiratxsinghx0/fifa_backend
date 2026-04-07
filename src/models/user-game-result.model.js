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
    KEY idx_puzzle_day (puzzle_day)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
`;

async function createTable() {
  await pool.execute(CREATE_TABLE);
}

async function findByUserAndDay(userId, puzzleDay) {
  const [rows] = await pool.execute(
    "SELECT * FROM user_game_results WHERE user_id = ? AND puzzle_day = ?",
    [userId, puzzleDay]
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

module.exports = { createTable, findByUserAndDay, create, getStatsByUser };
