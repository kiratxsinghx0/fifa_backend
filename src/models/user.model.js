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
  try { await pool.execute("ALTER TABLE users ADD COLUMN godmode_activated_at BIGINT DEFAULT NULL"); } catch { /* already exists */ }
  try { await pool.execute("ALTER TABLE users ADD COLUMN hard_mode_pref TINYINT(1) NOT NULL DEFAULT 0"); } catch { /* already exists */ }
  try { await pool.execute("ALTER TABLE users ADD COLUMN baseline_played_normal INT NOT NULL DEFAULT 0"); } catch { /* already exists */ }
  try { await pool.execute("ALTER TABLE users ADD COLUMN baseline_won_normal INT NOT NULL DEFAULT 0"); } catch { /* already exists */ }
  try { await pool.execute("ALTER TABLE users ADD COLUMN baseline_played_hard INT NOT NULL DEFAULT 0"); } catch { /* already exists */ }
  try { await pool.execute("ALTER TABLE users ADD COLUMN baseline_won_hard INT NOT NULL DEFAULT 0"); } catch { /* already exists */ }
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

async function mergeBaseline(userId, { played, won, maxStreak }) {
  await pool.execute(
    `UPDATE users SET
       baseline_played     = GREATEST(baseline_played, ?),
       baseline_won        = GREATEST(baseline_won, ?),
       baseline_max_streak = GREATEST(baseline_max_streak, ?)
     WHERE id = ?`,
    [played || 0, won || 0, maxStreak || 0, userId]
  );
}

async function setBaselinePerMode(userId, { playedNormal, wonNormal, playedHard, wonHard }) {
  await pool.execute(
    `UPDATE users SET
       baseline_played_normal = ?, baseline_won_normal = ?,
       baseline_played_hard = ?, baseline_won_hard = ?
     WHERE id = ?`,
    [playedNormal || 0, wonNormal || 0, playedHard || 0, wonHard || 0, userId]
  );
}

async function mergeBaselinePerMode(userId, { playedNormal, wonNormal, playedHard, wonHard }) {
  await pool.execute(
    `UPDATE users SET
       baseline_played_normal = GREATEST(baseline_played_normal, ?),
       baseline_won_normal    = GREATEST(baseline_won_normal, ?),
       baseline_played_hard   = GREATEST(baseline_played_hard, ?),
       baseline_won_hard      = GREATEST(baseline_won_hard, ?)
     WHERE id = ?`,
    [playedNormal || 0, wonNormal || 0, playedHard || 0, wonHard || 0, userId]
  );
}

const GODMODE_DURATION_MS = 24 * 60 * 60 * 1000;

async function getActiveGodmodeEmails() {
  const cutoff = Date.now() - GODMODE_DURATION_MS;
  const [rows] = await pool.execute(
    "SELECT email FROM users WHERE godmode_activated_at IS NOT NULL AND godmode_activated_at > ?",
    [cutoff]
  );
  return rows.map((r) => r.email);
}

async function setGodmodeActivatedAt(userId, timestamp) {
  await pool.execute(
    "UPDATE users SET godmode_activated_at = ? WHERE id = ?",
    [timestamp, userId]
  );
}

async function setHardModePref(userId, enabled) {
  await pool.execute(
    "UPDATE users SET hard_mode_pref = ? WHERE id = ?",
    [enabled ? 1 : 0, userId]
  );
}

module.exports = {
  createTable, findByEmail, findById, create, setBaseline, mergeBaseline,
  setBaselinePerMode, mergeBaselinePerMode,
  setGodmodeActivatedAt, setHardModePref,
  getActiveGodmodeEmails,
};
