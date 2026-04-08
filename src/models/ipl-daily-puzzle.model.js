const { pool } = require("../config/db");

const CREATE_IPL_DAILY_PUZZLES_TABLE = `
  CREATE TABLE IF NOT EXISTS ipl_daily_puzzles (
    id            INT AUTO_INCREMENT PRIMARY KEY,
    day           INT           NOT NULL COMMENT 'Puzzle day number',
    player_id     INT           NOT NULL,
    encoded       VARCHAR(50)   NOT NULL COMMENT 'XOR-encoded player token (base64)',
    hash          VARCHAR(128)  NOT NULL COMMENT 'SHA-256 of lowercase player name',
    previous_hash VARCHAR(128)  DEFAULT NULL,
    full_name     VARCHAR(100)  DEFAULT NULL COMMENT 'Player full name snapshot',
    is_shortened  TINYINT(1)    NOT NULL DEFAULT 0,
    hints         JSON          DEFAULT NULL COMMENT 'All player hint data for this puzzle',
    set_at        TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at    TIMESTAMP     DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY    uk_day (day),
    FOREIGN KEY   (player_id) REFERENCES ipl_players(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
`;

async function createTable() {
  await pool.execute(CREATE_IPL_DAILY_PUZZLES_TABLE);
}

async function findToday() {
  const [rows] = await pool.execute(
    `SELECT * FROM ipl_daily_puzzles
     WHERE set_at >= CURDATE() AND set_at < CURDATE() + INTERVAL 1 DAY
     ORDER BY set_at DESC
     LIMIT 1`
  );
  return rows[0] || null;
}

async function findByDay(day) {
  const [rows] = await pool.execute(
    `SELECT * FROM ipl_daily_puzzles WHERE day = ?`,
    [day]
  );
  return rows[0] || null;
}

async function findLatest() {
  const [rows] = await pool.execute(
    `SELECT * FROM ipl_daily_puzzles ORDER BY day DESC LIMIT 1`
  );
  return rows[0] || null;
}

async function create(puzzle) {
  const { day, player_id, encoded, hash, previous_hash, full_name, is_shortened, hints, set_at } = puzzle;
  const [result] = await pool.execute(
    `INSERT INTO ipl_daily_puzzles (day, player_id, encoded, hash, previous_hash, full_name, is_shortened, hints, set_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      day, player_id, encoded, hash,
      previous_hash || null,
      full_name || null,
      is_shortened ? 1 : 0,
      hints ? JSON.stringify(hints) : null,
      set_at || new Date(),
    ]
  );
  return result;
}

module.exports = { createTable, findToday, findByDay, findLatest, create };
