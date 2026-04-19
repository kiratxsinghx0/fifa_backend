const { pool } = require("../config/db");

const CREATE_TABLE = `
  CREATE TABLE IF NOT EXISTS challenge_conversions (
    id                    INT AUTO_INCREMENT PRIMARY KEY,
    room_code             VARCHAR(8)    NOT NULL,
    series_proposed       TINYINT(1)    NOT NULL DEFAULT 0,
    series_accepted       TINYINT(1)    NOT NULL DEFAULT 0,
    final_series_length   TINYINT       NOT NULL DEFAULT 1,
    created_at            TIMESTAMP     DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_cc_created (created_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
`;

async function createTable() {
  await pool.execute(CREATE_TABLE);
}

async function create(roomCode) {
  await pool.execute(
    `INSERT IGNORE INTO challenge_conversions (room_code) VALUES (?)`,
    [roomCode]
  );
}

async function markProposed(roomCode) {
  await pool.execute(
    `UPDATE challenge_conversions SET series_proposed = 1 WHERE room_code = ?`,
    [roomCode]
  );
}

async function markAccepted(roomCode, seriesLength) {
  await pool.execute(
    `UPDATE challenge_conversions SET series_accepted = 1, final_series_length = ? WHERE room_code = ?`,
    [seriesLength, roomCode]
  );
}

module.exports = { createTable, create, markProposed, markAccepted };
