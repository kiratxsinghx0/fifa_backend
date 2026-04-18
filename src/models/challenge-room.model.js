const { pool } = require("../config/db");

const CREATE_TABLE = `
  CREATE TABLE IF NOT EXISTS challenge_rooms (
    id                INT AUTO_INCREMENT PRIMARY KEY,
    room_code         VARCHAR(8)    UNIQUE NOT NULL,
    creator_user_id   INT           NULL,
    creator_name      VARCHAR(50)   NOT NULL,
    opponent_user_id  INT           NULL,
    opponent_name     VARCHAR(50)   NULL,
    series_length     TINYINT       NOT NULL DEFAULT 1,
    current_round     TINYINT       NOT NULL DEFAULT 1,
    creator_score     TINYINT       NOT NULL DEFAULT 0,
    opponent_score    TINYINT       NOT NULL DEFAULT 0,
    status            ENUM('waiting','active','between_rounds','completed','expired') DEFAULT 'waiting',
    winner            ENUM('creator','opponent','draw') NULL,
    created_at        TIMESTAMP     DEFAULT CURRENT_TIMESTAMP,
    completed_at      TIMESTAMP     NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
`;

const ENSURE_COLUMNS = [
  "ALTER TABLE challenge_rooms ADD COLUMN series_length TINYINT NOT NULL DEFAULT 1",
  "ALTER TABLE challenge_rooms ADD COLUMN current_round TINYINT NOT NULL DEFAULT 1",
  "ALTER TABLE challenge_rooms ADD COLUMN creator_score TINYINT NOT NULL DEFAULT 0",
  "ALTER TABLE challenge_rooms ADD COLUMN opponent_score TINYINT NOT NULL DEFAULT 0",
  "ALTER TABLE challenge_rooms MODIFY COLUMN status ENUM('waiting','active','between_rounds','completed','expired') DEFAULT 'waiting'",
];

async function createTable() {
  await pool.execute(CREATE_TABLE);
  for (const sql of ENSURE_COLUMNS) {
    try { await pool.execute(sql); } catch { /* column already exists */ }
  }
}

async function findByCode(code) {
  const [rows] = await pool.execute(
    "SELECT * FROM challenge_rooms WHERE room_code = ?",
    [code]
  );
  return rows[0] || null;
}

async function create(room) {
  const { room_code, creator_user_id, creator_name } = room;
  const [result] = await pool.execute(
    `INSERT INTO challenge_rooms (room_code, creator_user_id, creator_name)
     VALUES (?, ?, ?)`,
    [room_code, creator_user_id || null, creator_name]
  );
  return result;
}

async function setSeriesLength(roomCode, length) {
  const len = [3, 5].includes(length) ? length : 1;
  await pool.execute(
    `UPDATE challenge_rooms SET series_length = ? WHERE room_code = ?`,
    [len, roomCode]
  );
}

async function setOpponent(roomCode, opponentUserId, opponentName) {
  await pool.execute(
    `UPDATE challenge_rooms SET opponent_user_id = ?, opponent_name = ? WHERE room_code = ?`,
    [opponentUserId || null, opponentName, roomCode]
  );
}

async function startGame(roomCode) {
  await pool.execute(
    `UPDATE challenge_rooms SET status = 'active' WHERE room_code = ?`,
    [roomCode]
  );
}

async function updateScore(roomCode, role) {
  const col = role === "creator" ? "creator_score" : "opponent_score";
  await pool.execute(
    `UPDATE challenge_rooms SET ${col} = ${col} + 1 WHERE room_code = ?`,
    [roomCode]
  );
}

async function advanceRound(roomCode) {
  await pool.execute(
    `UPDATE challenge_rooms SET current_round = current_round + 1, status = 'active' WHERE room_code = ?`,
    [roomCode]
  );
}

async function setBetweenRounds(roomCode) {
  await pool.execute(
    `UPDATE challenge_rooms SET status = 'between_rounds' WHERE room_code = ?`,
    [roomCode]
  );
}

async function setWinner(roomCode, winner) {
  await pool.execute(
    `UPDATE challenge_rooms SET winner = ?, status = 'completed', completed_at = NOW() WHERE room_code = ?`,
    [winner, roomCode]
  );
}

async function expireOldRooms(minutesOld = 15) {
  const [result] = await pool.execute(
    `UPDATE challenge_rooms SET status = 'expired'
     WHERE status IN ('waiting','between_rounds') AND created_at < DATE_SUB(NOW(), INTERVAL ? MINUTE)`,
    [minutesOld]
  );
  return result.affectedRows;
}

module.exports = {
  createTable,
  findByCode,
  create,
  setSeriesLength,
  setOpponent,
  startGame,
  updateScore,
  advanceRound,
  setBetweenRounds,
  setWinner,
  expireOldRooms,
};
