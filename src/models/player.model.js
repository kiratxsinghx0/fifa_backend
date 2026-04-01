const { pool } = require("../config/db");

const CREATE_PLAYERS_TABLE = `
  CREATE TABLE IF NOT EXISTS players (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    name        VARCHAR(10)   NOT NULL COMMENT '5-letter wordle token e.g. MESSI, RONAL',
    full_name   VARCHAR(100)  DEFAULT NULL COMMENT 'Full name when token is shortened',
    is_shortened TINYINT(1)   NOT NULL DEFAULT 0,
    age         INT           NOT NULL,
    club        VARCHAR(100)  NOT NULL,
    country     VARCHAR(100)  NOT NULL,
    position    VARCHAR(10)   NOT NULL,
    trivia      VARCHAR(255)  NOT NULL,
    created_at  TIMESTAMP     DEFAULT CURRENT_TIMESTAMP,
    updated_at  TIMESTAMP     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY  uk_name (name)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
`;

async function createTable() {
  await pool.execute(CREATE_PLAYERS_TABLE);
}

async function findAll() {
  const [rows] = await pool.execute("SELECT * FROM players ORDER BY name");
  return rows;
}

async function findByName(name) {
  const [rows] = await pool.execute(
    "SELECT * FROM players WHERE name = ?",
    [name.toUpperCase()]
  );
  return rows[0] || null;
}

async function findById(id) {
  const [rows] = await pool.execute("SELECT * FROM players WHERE id = ?", [id]);
  return rows[0] || null;
}

async function create(player) {
  const { name, full_name, is_shortened, age, club, country, position, trivia } = player;
  const [result] = await pool.execute(
    `INSERT INTO players (name, full_name, is_shortened, age, club, country, position, trivia)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       full_name = VALUES(full_name),
       is_shortened = VALUES(is_shortened),
       age = VALUES(age),
       club = VALUES(club),
       country = VALUES(country),
       position = VALUES(position),
       trivia = VALUES(trivia)`,
    [name.toUpperCase(), full_name || null, is_shortened ? 1 : 0, age, club, country, position, trivia]
  );
  return result;
}

async function bulkCreate(players) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    for (const p of players) {
      await conn.execute(
        `INSERT INTO players (name, full_name, is_shortened, age, club, country, position, trivia)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           full_name = VALUES(full_name),
           is_shortened = VALUES(is_shortened),
           age = VALUES(age),
           club = VALUES(club),
           country = VALUES(country),
           position = VALUES(position),
           trivia = VALUES(trivia)`,
        [
          p.name.toUpperCase(),
          p.full_name || null,
          p.is_shortened ? 1 : 0,
          p.age,
          p.club,
          p.country,
          p.position,
          p.trivia,
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

module.exports = { createTable, findAll, findByName, findById, create, bulkCreate };
