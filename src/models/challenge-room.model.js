const { pool } = require("../config/db");

const CREATE_TABLE = `
  CREATE TABLE IF NOT EXISTS challenge_rooms (
    id                INT AUTO_INCREMENT PRIMARY KEY,
    room_code         VARCHAR(8)    UNIQUE NOT NULL,
    creator_user_id   INT           NULL,
    creator_name      VARCHAR(50)   NOT NULL,
    opponent_user_id  INT           NULL,
    opponent_name     VARCHAR(50)   NULL,
    player_id         INT           NULL COMMENT 'FK to ipl_multi_mode_players — set when game starts',
    player_name       VARCHAR(10)   NULL,
    full_name         VARCHAR(100)  NULL,
    encoded           VARCHAR(50)   NULL,
    hints             JSON          NULL,
    status            ENUM('waiting','active','completed','expired') DEFAULT 'waiting',
    winner            ENUM('creator','opponent','draw') NULL,
    creator_guesses   TINYINT       DEFAULT 0,
    opponent_guesses  TINYINT       DEFAULT 0,
    creator_finished  TINYINT(1)    DEFAULT 0,
    opponent_finished TINYINT(1)    DEFAULT 0,
    created_at        TIMESTAMP     DEFAULT CURRENT_TIMESTAMP,
    started_at        TIMESTAMP     NULL,
    completed_at      TIMESTAMP     NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
`;

async function createTable() {
  await pool.execute(CREATE_TABLE);
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

async function setOpponent(roomCode, opponentUserId, opponentName) {
  await pool.execute(
    `UPDATE challenge_rooms SET opponent_user_id = ?, opponent_name = ? WHERE room_code = ?`,
    [opponentUserId || null, opponentName, roomCode]
  );
}

async function startGame(roomCode, playerId, playerName, fullName, encoded, hints) {
  await pool.execute(
    `UPDATE challenge_rooms
     SET player_id = ?, player_name = ?, full_name = ?, encoded = ?, hints = ?,
         status = 'active', started_at = NOW()
     WHERE room_code = ?`,
    [playerId, playerName, fullName, encoded, JSON.stringify(hints), roomCode]
  );
}

async function recordGuess(roomCode, role) {
  const col = role === "creator" ? "creator_guesses" : "opponent_guesses";
  await pool.execute(
    `UPDATE challenge_rooms SET ${col} = ${col} + 1 WHERE room_code = ?`,
    [roomCode]
  );
}

async function markFinished(roomCode, role) {
  const col = role === "creator" ? "creator_finished" : "opponent_finished";
  await pool.execute(
    `UPDATE challenge_rooms SET ${col} = 1 WHERE room_code = ?`,
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
     WHERE status = 'waiting' AND created_at < DATE_SUB(NOW(), INTERVAL ? MINUTE)`,
    [minutesOld]
  );
  return result.affectedRows;
}

module.exports = {
  createTable,
  findByCode,
  create,
  setOpponent,
  startGame,
  recordGuess,
  markFinished,
  setWinner,
  expireOldRooms,
};
