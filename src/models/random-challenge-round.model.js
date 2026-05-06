const { pool } = require("../config/db");

const CREATE_TABLE = `
  CREATE TABLE IF NOT EXISTS random_challenge_rounds (
    id                INT AUTO_INCREMENT PRIMARY KEY,
    room_id           INT           NOT NULL,
    round_number      TINYINT       NOT NULL,
    player_id         INT           NULL,
    player_name       VARCHAR(10)   NULL,
    full_name         VARCHAR(100)  NULL,
    encoded           VARCHAR(50)   NULL,
    hints             JSON          NULL,
    winner            ENUM('player_a','player_b','draw') NULL,
    player_a_guesses  TINYINT       DEFAULT 0,
    player_b_guesses  TINYINT       DEFAULT 0,
    player_a_finished TINYINT(1)    DEFAULT 0,
    player_b_finished TINYINT(1)    DEFAULT 0,
    started_at        TIMESTAMP     NULL,
    completed_at      TIMESTAMP     NULL,
    KEY idx_room (room_id),
    KEY idx_room_round (room_id, round_number)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
`;

async function createTable() {
  await pool.execute(CREATE_TABLE);
}

async function create(entry) {
  const {
    room_id, round_number, player_id, player_name,
    full_name, encoded, hints,
  } = entry;
  const [result] = await pool.execute(
    `INSERT INTO random_challenge_rounds
       (room_id, round_number, player_id, player_name, full_name, encoded, hints, started_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`,
    [room_id, round_number, player_id, player_name, full_name, encoded, JSON.stringify(hints)]
  );
  return result;
}

async function findByRoomId(roomId) {
  const [rows] = await pool.execute(
    "SELECT * FROM random_challenge_rounds WHERE room_id = ? ORDER BY round_number ASC",
    [roomId]
  );
  return rows;
}

async function findCurrentRound(roomId, roundNumber) {
  const [rows] = await pool.execute(
    "SELECT * FROM random_challenge_rounds WHERE room_id = ? AND round_number = ?",
    [roomId, roundNumber]
  );
  return rows[0] || null;
}

async function recordGuess(roundId, role) {
  const col = role === "player_a" ? "player_a_guesses" : "player_b_guesses";
  await pool.execute(
    `UPDATE random_challenge_rounds SET ${col} = ${col} + 1 WHERE id = ?`,
    [roundId]
  );
}

async function markFinished(roundId, role) {
  const col = role === "player_a" ? "player_a_finished" : "player_b_finished";
  await pool.execute(
    `UPDATE random_challenge_rounds SET ${col} = 1 WHERE id = ?`,
    [roundId]
  );
}

async function setWinner(roundId, winner) {
  await pool.execute(
    `UPDATE random_challenge_rounds SET winner = ?, completed_at = NOW() WHERE id = ?`,
    [winner, roundId]
  );
}

module.exports = {
  createTable,
  create,
  findByRoomId,
  findCurrentRound,
  recordGuess,
  markFinished,
  setWinner,
};
