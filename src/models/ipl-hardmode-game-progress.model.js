const { pool } = require("../config/db");

const CREATE_TABLE = `
  CREATE TABLE IF NOT EXISTS ipl_hardmode_game_progress (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    user_id         INT NOT NULL,
    puzzle_day      INT NOT NULL,
    guesses_json    TEXT NOT NULL,
    elapsed_seconds INT DEFAULT 0,
    completed       TINYINT(1) NOT NULL DEFAULT 0,
    updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    UNIQUE KEY uk_user_puzzle (user_id, puzzle_day),
    FOREIGN KEY (user_id) REFERENCES users(id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
`;

async function createTable() {
  await pool.execute(CREATE_TABLE);
}

async function findByUserAndDay(userId, puzzleDay) {
  const [rows] = await pool.execute(
    "SELECT * FROM ipl_hardmode_game_progress WHERE user_id = ? AND puzzle_day = ?",
    [userId, puzzleDay]
  );
  return rows[0] || null;
}

async function upsert({ user_id, puzzle_day, guesses_json, elapsed_seconds, completed }) {
  await pool.execute(
    `INSERT INTO ipl_hardmode_game_progress
       (user_id, puzzle_day, guesses_json, elapsed_seconds, completed)
     VALUES (?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       guesses_json = VALUES(guesses_json),
       elapsed_seconds = VALUES(elapsed_seconds),
       completed = VALUES(completed)`,
    [
      user_id,
      puzzle_day,
      guesses_json,
      elapsed_seconds ?? 0,
      completed ? 1 : 0,
    ]
  );
}

async function markCompleted(userId, puzzleDay) {
  await pool.execute(
    "UPDATE ipl_hardmode_game_progress SET completed = 1 WHERE user_id = ? AND puzzle_day = ?",
    [userId, puzzleDay]
  );
}

module.exports = { createTable, findByUserAndDay, upsert, markCompleted };
