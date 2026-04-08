const { pool } = require("../config/db");

const CREATE_SCHEDULED_IPL_PUZZLES_TABLE = `
  CREATE TABLE IF NOT EXISTS scheduled_ipl_puzzles (
    id            INT AUTO_INCREMENT PRIMARY KEY,
    player_name   VARCHAR(10)   NOT NULL COMMENT '5-letter wordle token (e.g. VIRAT)',
    full_name     VARCHAR(100)  NOT NULL COMMENT 'Canonical player name',
    hints         JSON          DEFAULT NULL COMMENT 'Hint data for the puzzle',
    used          TINYINT(1)    NOT NULL DEFAULT 0 COMMENT '1 once promoted to ipl_daily_puzzles',
    created_at    TIMESTAMP     DEFAULT CURRENT_TIMESTAMP,
    updated_at    TIMESTAMP     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
`;

async function createTable() {
  await pool.execute(CREATE_SCHEDULED_IPL_PUZZLES_TABLE);
}

async function findNextUnused() {
  const [rows] = await pool.execute(
    `SELECT * FROM scheduled_ipl_puzzles
     WHERE used = 0
     ORDER BY created_at ASC, id ASC
     LIMIT 1`
  );
  return rows[0] || null;
}

async function markUsed(id) {
  await pool.execute(
    `UPDATE scheduled_ipl_puzzles SET used = 1 WHERE id = ?`,
    [id]
  );
}

async function create(entry) {
  const { player_name, full_name, hints } = entry;
  const [result] = await pool.execute(
    `INSERT INTO scheduled_ipl_puzzles (player_name, full_name, hints)
     VALUES (?, ?, ?)`,
    [
      player_name.toUpperCase(),
      full_name,
      hints ? JSON.stringify(hints) : null,
    ]
  );
  return result;
}

async function bulkCreate(entries) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    for (const e of entries) {
      await conn.execute(
        `INSERT INTO scheduled_ipl_puzzles (player_name, full_name, hints)
         VALUES (?, ?, ?)`,
        [
          e.player_name.toUpperCase(),
          e.full_name,
          e.hints ? JSON.stringify(e.hints) : null,
        ]
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

async function findAll() {
  const [rows] = await pool.execute(
    `SELECT * FROM scheduled_ipl_puzzles ORDER BY created_at ASC, id ASC`
  );
  return rows;
}

async function findAllUnused() {
  const [rows] = await pool.execute(
    `SELECT * FROM scheduled_ipl_puzzles WHERE used = 0 ORDER BY created_at ASC, id ASC`
  );
  return rows;
}

module.exports = {
  createTable,
  findNextUnused,
  markUsed,
  create,
  bulkCreate,
  findAll,
  findAllUnused,
};
