const { pool } = require("../config/db");

const CREATE_IPL_PLAYERS_TABLE = `
  CREATE TABLE IF NOT EXISTS ipl_players (
    id            INT AUTO_INCREMENT PRIMARY KEY,
    name          VARCHAR(10)   NOT NULL COMMENT 'Guessable wordle token (VIRAT, KOHLI, SINGH, MS)',
    full_name     VARCHAR(100)  NOT NULL COMMENT 'Canonical player name – groups aliases together',
    is_shortened  TINYINT(1)    NOT NULL DEFAULT 0,
    created_at    TIMESTAMP     DEFAULT CURRENT_TIMESTAMP,
    updated_at    TIMESTAMP     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY    uk_token_player (name, full_name),
    KEY           idx_full_name (full_name)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
`;

async function createTable() {
  await pool.execute(CREATE_IPL_PLAYERS_TABLE);
}

async function findAll() {
  const [rows] = await pool.execute("SELECT * FROM ipl_players ORDER BY full_name, name");
  return rows;
}

async function findByName(name) {
  const [rows] = await pool.execute(
    "SELECT * FROM ipl_players WHERE name = ?",
    [name.toUpperCase()]
  );
  return rows;
}

async function findByNameAndPlayer(name, fullName) {
  const [rows] = await pool.execute(
    "SELECT * FROM ipl_players WHERE name = ? AND full_name = ?",
    [name.toUpperCase(), fullName]
  );
  return rows[0] || null;
}

async function findById(id) {
  const [rows] = await pool.execute("SELECT * FROM ipl_players WHERE id = ?", [id]);
  return rows[0] || null;
}

async function findByFullName(fullName) {
  const [rows] = await pool.execute(
    "SELECT * FROM ipl_players WHERE full_name = ? ORDER BY name",
    [fullName]
  );
  return rows;
}

async function create(player) {
  const { name, full_name, is_shortened } = player;
  const [result] = await pool.execute(
    `INSERT INTO ipl_players (name, full_name, is_shortened)
     VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE
       is_shortened = VALUES(is_shortened)`,
    [name.toUpperCase(), full_name, is_shortened ? 1 : 0]
  );
  return result;
}

async function bulkCreate(players) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    for (const p of players) {
      await conn.execute(
        `INSERT INTO ipl_players (name, full_name, is_shortened)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE
           is_shortened = VALUES(is_shortened)`,
        [p.name.toUpperCase(), p.full_name, p.is_shortened ? 1 : 0]
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

async function findRandomExcluding(excludeFullName) {
  const countQuery = excludeFullName
    ? `SELECT COUNT(*) AS cnt FROM ipl_players WHERE CHAR_LENGTH(name) = 5 AND full_name != ?`
    : `SELECT COUNT(*) AS cnt FROM ipl_players WHERE CHAR_LENGTH(name) = 5`;
  const countParams = excludeFullName ? [excludeFullName] : [];
  const [[{ cnt }]] = await pool.execute(countQuery, countParams);
  if (cnt === 0) return null;
  const offset = Math.floor(Math.random() * cnt);
  const rowQuery = excludeFullName
    ? `SELECT * FROM ipl_players WHERE CHAR_LENGTH(name) = 5 AND full_name != ? LIMIT 1 OFFSET ${offset}`
    : `SELECT * FROM ipl_players WHERE CHAR_LENGTH(name) = 5 LIMIT 1 OFFSET ${offset}`;
  const [rows] = await pool.execute(rowQuery, countParams);
  return rows[0] || null;
}

async function getCount() {
  const [rows] = await pool.execute("SELECT COUNT(DISTINCT full_name) AS count FROM ipl_players");
  return rows[0].count;
}

module.exports = {
  createTable, findAll, findByName, findByNameAndPlayer,
  findById, findByFullName, create, bulkCreate,
  findRandomExcluding, getCount,
};
