const { pool } = require("../config/db");

const CREATE_TABLE = `
  CREATE TABLE IF NOT EXISTS user_archive_results (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    user_id     INT NOT NULL,
    puzzle_day  INT NOT NULL,
    won         TINYINT(1) NOT NULL DEFAULT 0,
    played_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    UNIQUE KEY uk_user_archive_day (user_id, puzzle_day),
    FOREIGN KEY (user_id) REFERENCES users(id),
    KEY idx_archive_puzzle_day (puzzle_day)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
`;

async function createTable() {
  await pool.execute(CREATE_TABLE);
}

async function findByUser(userId) {
  const [rows] = await pool.execute(
    "SELECT puzzle_day, won FROM user_archive_results WHERE user_id = ? ORDER BY puzzle_day ASC",
    [userId]
  );
  return rows;
}

async function create({ user_id, puzzle_day, won }) {
  await pool.execute(
    `INSERT INTO user_archive_results (user_id, puzzle_day, won)
     VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE won = VALUES(won)`,
    [user_id, puzzle_day, won ? 1 : 0]
  );
}

module.exports = { createTable, findByUser, create };
