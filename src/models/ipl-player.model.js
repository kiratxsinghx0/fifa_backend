const { pool } = require("../config/db");

const CREATE_IPL_PLAYERS_TABLE = `
  CREATE TABLE IF NOT EXISTS ipl_players (
    id            INT AUTO_INCREMENT PRIMARY KEY,
    name          VARCHAR(10)   NOT NULL COMMENT '5-letter wordle token e.g. VIRAT, DHONI',
    full_name     VARCHAR(100)  DEFAULT NULL COMMENT 'Full name when token is shortened',
    is_shortened  TINYINT(1)    NOT NULL DEFAULT 0,
    age           INT           NOT NULL,
    country       VARCHAR(100)  NOT NULL,
    ipl_team      VARCHAR(100)  NOT NULL,
    role          VARCHAR(50)   NOT NULL,
    teams         JSON          NOT NULL COMMENT 'Array of team names',
    batting       VARCHAR(50)   NOT NULL DEFAULT 'N/A',
    bowling       VARCHAR(50)   NOT NULL DEFAULT 'N/A',
    jersey        INT           DEFAULT NULL,
    nickname      VARCHAR(100)  DEFAULT NULL,
    era           VARCHAR(50)   NOT NULL DEFAULT 'current',
    popularity    VARCHAR(50)   NOT NULL DEFAULT 'regular',
    opening_hint  VARCHAR(500)  NOT NULL DEFAULT '',
    trivias       JSON          NOT NULL COMMENT 'Array of trivia strings',
    created_at    TIMESTAMP     DEFAULT CURRENT_TIMESTAMP,
    updated_at    TIMESTAMP     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY    uk_name (name)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
`;

async function createTable() {
  await pool.execute(CREATE_IPL_PLAYERS_TABLE);
}

async function findAll() {
  const [rows] = await pool.execute("SELECT * FROM ipl_players ORDER BY name");
  return rows;
}

async function findByName(name) {
  const [rows] = await pool.execute(
    "SELECT * FROM ipl_players WHERE name = ?",
    [name.toUpperCase()]
  );
  return rows[0] || null;
}

async function findById(id) {
  const [rows] = await pool.execute("SELECT * FROM ipl_players WHERE id = ?", [id]);
  return rows[0] || null;
}

async function create(player) {
  const {
    name, full_name, is_shortened,
    age, country, ipl_team, role, teams, batting, bowling,
    jersey, nickname, era, popularity,
    opening_hint, trivias,
  } = player;
  const [result] = await pool.execute(
    `INSERT INTO ipl_players
       (name, full_name, is_shortened, age, country, ipl_team, role, teams, batting, bowling, jersey, nickname, era, popularity, opening_hint, trivias)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       full_name    = VALUES(full_name),
       is_shortened = VALUES(is_shortened),
       age          = VALUES(age),
       country      = VALUES(country),
       ipl_team     = VALUES(ipl_team),
       role         = VALUES(role),
       teams        = VALUES(teams),
       batting      = VALUES(batting),
       bowling      = VALUES(bowling),
       jersey       = VALUES(jersey),
       nickname     = VALUES(nickname),
       era          = VALUES(era),
       popularity   = VALUES(popularity),
       opening_hint = VALUES(opening_hint),
       trivias      = VALUES(trivias)`,
    [
      name.toUpperCase(),
      full_name || null,
      is_shortened ? 1 : 0,
      age,
      country,
      ipl_team,
      role,
      JSON.stringify(teams),
      batting,
      bowling,
      jersey ?? null,
      nickname || null,
      era || "current",
      popularity || "regular",
      opening_hint,
      JSON.stringify(trivias),
    ]
  );
  return result;
}

async function bulkCreate(players) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    for (const p of players) {
      await conn.execute(
        `INSERT INTO ipl_players
           (name, full_name, is_shortened, age, country, ipl_team, role, teams, batting, bowling, jersey, nickname, era, popularity, opening_hint, trivias)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           full_name    = VALUES(full_name),
           is_shortened = VALUES(is_shortened),
           age          = VALUES(age),
           country      = VALUES(country),
           ipl_team     = VALUES(ipl_team),
           role         = VALUES(role),
           teams        = VALUES(teams),
           batting      = VALUES(batting),
           bowling      = VALUES(bowling),
           jersey       = VALUES(jersey),
           nickname     = VALUES(nickname),
           era          = VALUES(era),
           popularity   = VALUES(popularity),
           opening_hint = VALUES(opening_hint),
           trivias      = VALUES(trivias)`,
        [
          p.name.toUpperCase(),
          p.full_name || null,
          p.is_shortened ? 1 : 0,
          p.age,
          p.country,
          p.ipl_team,
          p.role,
          JSON.stringify(p.teams),
          p.batting,
          p.bowling,
          p.jersey ?? null,
          p.nickname || null,
          p.era || "current",
          p.popularity || "regular",
          p.opening_hint,
          JSON.stringify(p.trivias),
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

async function findRandomExcluding(excludeId) {
  const query = excludeId
    ? `SELECT * FROM ipl_players WHERE CHAR_LENGTH(name) = 5 AND id != ? ORDER BY RAND() LIMIT 1`
    : `SELECT * FROM ipl_players WHERE CHAR_LENGTH(name) = 5 ORDER BY RAND() LIMIT 1`;
  const params = excludeId ? [excludeId] : [];
  const [rows] = await pool.execute(query, params);
  return rows[0] || null;
}

async function getCount() {
  const [rows] = await pool.execute("SELECT COUNT(*) AS count FROM ipl_players");
  return rows[0].count;
}

module.exports = { createTable, findAll, findByName, findById, create, bulkCreate, findRandomExcluding, getCount };
