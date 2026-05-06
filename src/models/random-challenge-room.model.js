const { pool } = require("../config/db");

const CREATE_TABLE = `
  CREATE TABLE IF NOT EXISTS random_challenge_rooms (
    id                INT AUTO_INCREMENT PRIMARY KEY,
    room_code         VARCHAR(8)    UNIQUE NOT NULL,
    player_a_user_id  INT           NULL,
    player_a_name     VARCHAR(50)   NOT NULL,
    player_b_user_id  INT           NULL,
    player_b_name     VARCHAR(50)   NULL,
    series_length     TINYINT       NOT NULL DEFAULT 1,
    current_round     TINYINT       NOT NULL DEFAULT 1,
    player_a_score    TINYINT       NOT NULL DEFAULT 0,
    player_b_score    TINYINT       NOT NULL DEFAULT 0,
    status            ENUM('waiting','active','between_rounds','completed','expired') DEFAULT 'waiting',
    winner            ENUM('player_a','player_b','draw') NULL,
    is_bot_match      TINYINT(1)    NOT NULL DEFAULT 0,
    bot_persona       VARCHAR(50)   NULL,
    matched_at        TIMESTAMP     NULL,
    created_at        TIMESTAMP     DEFAULT CURRENT_TIMESTAMP,
    completed_at      TIMESTAMP     NULL,
    KEY idx_status (status),
    KEY idx_is_bot (is_bot_match)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
`;

async function createTable() {
  await pool.execute(CREATE_TABLE);
}

async function findByCode(code) {
  const [rows] = await pool.execute(
    "SELECT * FROM random_challenge_rooms WHERE room_code = ?",
    [code]
  );
  return rows[0] || null;
}

async function create(room) {
  const {
    room_code, player_a_user_id, player_a_name,
    player_b_user_id, player_b_name,
    is_bot_match = 0, bot_persona = null,
  } = room;
  const [result] = await pool.execute(
    `INSERT INTO random_challenge_rooms
       (room_code, player_a_user_id, player_a_name, player_b_user_id, player_b_name,
        is_bot_match, bot_persona, matched_at, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), 'waiting')`,
    [
      room_code,
      player_a_user_id || null, player_a_name,
      player_b_user_id || null, player_b_name || null,
      is_bot_match ? 1 : 0, bot_persona,
    ]
  );
  return result;
}

async function setSeriesLength(roomCode, length) {
  const len = [3, 5].includes(length) ? length : 1;
  await pool.execute(
    `UPDATE random_challenge_rooms SET series_length = ? WHERE room_code = ?`,
    [len, roomCode]
  );
}

async function startGame(roomCode) {
  await pool.execute(
    `UPDATE random_challenge_rooms SET status = 'active' WHERE room_code = ?`,
    [roomCode]
  );
}

async function updateScore(roomCode, role) {
  const col = role === "player_a" ? "player_a_score" : "player_b_score";
  await pool.execute(
    `UPDATE random_challenge_rooms SET ${col} = ${col} + 1 WHERE room_code = ?`,
    [roomCode]
  );
}

async function advanceRound(roomCode) {
  await pool.execute(
    `UPDATE random_challenge_rooms SET current_round = current_round + 1, status = 'active' WHERE room_code = ?`,
    [roomCode]
  );
}

async function setBetweenRounds(roomCode) {
  await pool.execute(
    `UPDATE random_challenge_rooms SET status = 'between_rounds' WHERE room_code = ?`,
    [roomCode]
  );
}

async function setWinner(roomCode, winner) {
  await pool.execute(
    `UPDATE random_challenge_rooms SET winner = ?, status = 'completed', completed_at = NOW() WHERE room_code = ?`,
    [winner, roomCode]
  );
}

async function expireOldRooms(minutesOld = 15) {
  const [result] = await pool.execute(
    `UPDATE random_challenge_rooms SET status = 'expired'
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
  startGame,
  updateScore,
  advanceRound,
  setBetweenRounds,
  setWinner,
  expireOldRooms,
};
