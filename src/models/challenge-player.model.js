const { pool } = require("../config/db");

const CREATE_TABLE = `
  CREATE TABLE IF NOT EXISTS ipl_multi_mode_players (
    id            INT AUTO_INCREMENT PRIMARY KEY,
    player_name   VARCHAR(10)   NOT NULL COMMENT '5-letter guessable token (e.g. JOFRA)',
    full_name     VARCHAR(100)  NOT NULL COMMENT 'Canonical player name',
    hints         JSON          NOT NULL COMMENT 'openingHint, iplTeam, country, role, trivia[]',
    created_at    TIMESTAMP     DEFAULT CURRENT_TIMESTAMP,
    updated_at    TIMESTAMP     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY    uk_token_player (player_name, full_name)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
`;

async function createTable() {
  await pool.execute(CREATE_TABLE);
}

async function findAll() {
  const [rows] = await pool.execute(
    "SELECT * FROM ipl_multi_mode_players ORDER BY full_name, player_name"
  );
  return rows;
}

async function findRandom() {
  const [[{ cnt }]] = await pool.execute(
    "SELECT COUNT(*) AS cnt FROM ipl_multi_mode_players WHERE CHAR_LENGTH(player_name) = 5"
  );
  const total = Number(cnt);
  if (total === 0) return null;
  const offset = Math.floor(Math.random() * total);
  const [rows] = await pool.query(
    `SELECT * FROM ipl_multi_mode_players WHERE CHAR_LENGTH(player_name) = 5 LIMIT 1 OFFSET ${offset}`
  );
  return rows[0] || null;
}

async function findRandomExcluding(excludeIds) {
  const ids = (excludeIds || []).filter(Boolean);
  if (ids.length === 0) return findRandom();
  const placeholders = ids.map(() => "?").join(", ");
  const [[{ cnt }]] = await pool.execute(
    `SELECT COUNT(*) AS cnt FROM ipl_multi_mode_players WHERE CHAR_LENGTH(player_name) = 5 AND id NOT IN (${placeholders})`,
    ids
  );
  const total = Number(cnt);
  if (total === 0) return findRandom();
  const offset = Math.floor(Math.random() * total);
  const [rows] = await pool.query(
    `SELECT * FROM ipl_multi_mode_players WHERE CHAR_LENGTH(player_name) = 5 AND id NOT IN (${ids.map((i) => pool.escape(i)).join(", ")}) LIMIT 1 OFFSET ${offset}`
  );
  return rows[0] || null;
}

async function findById(id) {
  const [rows] = await pool.execute(
    "SELECT * FROM ipl_multi_mode_players WHERE id = ?",
    [id]
  );
  return rows[0] || null;
}

async function findByName(name) {
  const [rows] = await pool.execute(
    "SELECT * FROM ipl_multi_mode_players WHERE player_name = ?",
    [name.toUpperCase()]
  );
  return rows;
}

async function create(entry) {
  const { player_name, full_name, hints } = entry;
  const [result] = await pool.execute(
    `INSERT INTO ipl_multi_mode_players (player_name, full_name, hints)
     VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE hints = VALUES(hints)`,
    [player_name.toUpperCase(), full_name, JSON.stringify(hints)]
  );
  return result;
}

async function bulkCreate(entries) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    for (const e of entries) {
      await conn.execute(
        `INSERT INTO ipl_multi_mode_players (player_name, full_name, hints)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE hints = VALUES(hints)`,
        [e.player_name.toUpperCase(), e.full_name, JSON.stringify(e.hints)]
      );
    }
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

async function getCount() {
  const [rows] = await pool.execute(
    "SELECT COUNT(*) AS count FROM ipl_multi_mode_players"
  );
  return rows[0].count;
}

module.exports = {
  createTable,
  findAll,
  findRandom,
  findRandomExcluding,
  findById,
  findByName,
  create,
  bulkCreate,
  getCount,
};
