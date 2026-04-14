const { pool } = require("../config/db");

const CREATE_TABLE = `
  CREATE TABLE IF NOT EXISTS challenge_guesses (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    room_id         INT           NOT NULL,
    player_role     ENUM('creator','opponent') NOT NULL,
    guess           VARCHAR(20)   NOT NULL,
    guess_number    TINYINT       NOT NULL,
    letter_statuses JSON          NOT NULL,
    correct_count   TINYINT       NOT NULL DEFAULT 0,
    present_count   TINYINT       NOT NULL DEFAULT 0,
    is_correct      TINYINT(1)    DEFAULT 0,
    guessed_at      TIMESTAMP(3)  DEFAULT CURRENT_TIMESTAMP(3),
    KEY idx_room (room_id),
    KEY idx_room_role (room_id, player_role)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
`;

async function createTable() {
  await pool.execute(CREATE_TABLE);
}

async function create(entry) {
  const {
    room_id, player_role, guess, guess_number,
    letter_statuses, correct_count, present_count, is_correct,
  } = entry;
  const [result] = await pool.execute(
    `INSERT INTO challenge_guesses
       (room_id, player_role, guess, guess_number, letter_statuses, correct_count, present_count, is_correct)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      room_id, player_role, guess, guess_number,
      JSON.stringify(letter_statuses), correct_count, present_count, is_correct ? 1 : 0,
    ]
  );
  return result;
}

async function findByRoom(roomId) {
  const [rows] = await pool.execute(
    "SELECT * FROM challenge_guesses WHERE room_id = ? ORDER BY guessed_at ASC",
    [roomId]
  );
  return rows;
}

async function findByRoomAndRole(roomId, role) {
  const [rows] = await pool.execute(
    "SELECT * FROM challenge_guesses WHERE room_id = ? AND player_role = ? ORDER BY guess_number ASC",
    [roomId, role]
  );
  return rows;
}

async function getGuessCount(roomId, role) {
  const [[{ cnt }]] = await pool.execute(
    "SELECT COUNT(*) AS cnt FROM challenge_guesses WHERE room_id = ? AND player_role = ?",
    [roomId, role]
  );
  return cnt;
}

module.exports = {
  createTable,
  create,
  findByRoom,
  findByRoomAndRole,
  getGuessCount,
};
