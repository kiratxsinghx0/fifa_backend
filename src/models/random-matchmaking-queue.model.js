const { pool } = require("../config/db");

const CREATE_TABLE = `
  CREATE TABLE IF NOT EXISTS random_matchmaking_queue (
    id                  INT AUTO_INCREMENT PRIMARY KEY,
    user_id             INT           NULL,
    display_name        VARCHAR(50)   NOT NULL,
    device_id           VARCHAR(64)   NULL,
    socket_id           VARCHAR(64)   NULL,
    joined_at           TIMESTAMP(3)  DEFAULT CURRENT_TIMESTAMP(3),
    matched_at          TIMESTAMP(3)  NULL,
    status              ENUM('searching','matched','left','timed_out') NOT NULL DEFAULT 'searching',
    matched_room_code   VARCHAR(8)    NULL,
    search_duration_ms  INT           NULL,
    KEY idx_status (status),
    KEY idx_socket (socket_id),
    KEY idx_room (matched_room_code)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
`;

async function createTable() {
  await pool.execute(CREATE_TABLE);
}

async function create(entry) {
  const { user_id, display_name, device_id, socket_id } = entry;
  const [result] = await pool.execute(
    `INSERT INTO random_matchmaking_queue
       (user_id, display_name, device_id, socket_id, status)
     VALUES (?, ?, ?, ?, 'searching')`,
    [user_id || null, display_name, device_id || null, socket_id || null]
  );
  return result;
}

async function markMatched(id, roomCode, durationMs) {
  await pool.execute(
    `UPDATE random_matchmaking_queue
        SET status = 'matched', matched_at = CURRENT_TIMESTAMP(3),
            matched_room_code = ?, search_duration_ms = ?
      WHERE id = ?`,
    [roomCode, Math.max(0, Math.floor(durationMs || 0)), id]
  );
}

async function markLeft(id, durationMs) {
  await pool.execute(
    `UPDATE random_matchmaking_queue
        SET status = 'left', search_duration_ms = ?
      WHERE id = ?`,
    [Math.max(0, Math.floor(durationMs || 0)), id]
  );
}

async function markTimedOut(id, durationMs) {
  await pool.execute(
    `UPDATE random_matchmaking_queue
        SET status = 'timed_out', search_duration_ms = ?
      WHERE id = ?`,
    [Math.max(0, Math.floor(durationMs || 0)), id]
  );
}

async function countByStatus(status) {
  const [[{ cnt }]] = await pool.execute(
    "SELECT COUNT(*) AS cnt FROM random_matchmaking_queue WHERE status = ?",
    [status]
  );
  return cnt;
}

module.exports = {
  createTable,
  create,
  markMatched,
  markLeft,
  markTimedOut,
  countByStatus,
};
