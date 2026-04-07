const { pool } = require("../config/db");

const CREATE_USERS_TABLE = `
  CREATE TABLE IF NOT EXISTS users (
    id                  INT AUTO_INCREMENT PRIMARY KEY,
    email               VARCHAR(255) NOT NULL UNIQUE,
    password_hash       VARCHAR(255) NOT NULL,
    baseline_played     INT NOT NULL DEFAULT 0,
    baseline_won        INT NOT NULL DEFAULT 0,
    baseline_max_streak INT NOT NULL DEFAULT 0,
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
`;

const ENSURE_BASELINE_COLS = `
  ALTER TABLE users
    ADD COLUMN IF NOT EXISTS baseline_played INT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS baseline_won INT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS baseline_max_streak INT NOT NULL DEFAULT 0;
`;

async function createTable() {
  await pool.execute(CREATE_USERS_TABLE);
  try { await pool.execute(ENSURE_BASELINE_COLS); } catch { /* columns already exist */ }
}

async function findByEmail(email) {
  const [rows] = await pool.execute(
    "SELECT * FROM users WHERE email = ?",
    [email.trim().toLowerCase()]
  );
  return rows[0] || null;
}

async function findById(id) {
  const [rows] = await pool.execute("SELECT * FROM users WHERE id = ?", [id]);
  return rows[0] || null;
}

async function create(email, passwordHash) {
  const [result] = await pool.execute(
    "INSERT INTO users (email, password_hash) VALUES (?, ?)",
    [email.trim().toLowerCase(), passwordHash]
  );
  return { id: result.insertId, email: email.trim().toLowerCase() };
}

async function setBaseline(userId, { played, won, maxStreak }) {
  await pool.execute(
    `UPDATE users SET baseline_played = ?, baseline_won = ?, baseline_max_streak = ? WHERE id = ?`,
    [played || 0, won || 0, maxStreak || 0, userId]
  );
}

module.exports = { createTable, findByEmail, findById, create, setBaseline };
