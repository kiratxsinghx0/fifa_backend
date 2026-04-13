const { pool } = require("../config/db");

const CREATE_TABLE = `
  CREATE TABLE IF NOT EXISTS user_achievements (
    id                        INT AUTO_INCREMENT PRIMARY KEY,
    user_id                   INT NOT NULL UNIQUE,
    normal_current_streak     INT NOT NULL DEFAULT 0,
    normal_max_streak         INT NOT NULL DEFAULT 0,
    hard_current_streak       INT NOT NULL DEFAULT 0,
    hard_max_streak           INT NOT NULL DEFAULT 0,
    godmode_activations_count INT NOT NULL DEFAULT 0,
    created_at                TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at                TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
`;

async function createTable() {
  await pool.execute(CREATE_TABLE);
  try { await pool.execute("ALTER TABLE user_achievements ADD COLUMN godmode_activations_count INT NOT NULL DEFAULT 0"); } catch { /* already exists */ }
}

async function findByUserId(userId) {
  const [rows] = await pool.execute(
    "SELECT * FROM user_achievements WHERE user_id = ?",
    [userId]
  );
  return rows[0] || null;
}

async function upsert(userId, { normalCurrentStreak, normalMaxStreak, hardCurrentStreak, hardMaxStreak }) {
  await pool.execute(
    `INSERT INTO user_achievements (user_id, normal_current_streak, normal_max_streak, hard_current_streak, hard_max_streak)
     VALUES (?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       normal_current_streak = VALUES(normal_current_streak),
       normal_max_streak     = VALUES(normal_max_streak),
       hard_current_streak   = VALUES(hard_current_streak),
       hard_max_streak       = VALUES(hard_max_streak)`,
    [userId, normalCurrentStreak || 0, normalMaxStreak || 0, hardCurrentStreak || 0, hardMaxStreak || 0]
  );
}

async function updateNormalStreaks(userId, currentStreak, maxStreak) {
  await pool.execute(
    `INSERT INTO user_achievements (user_id, normal_current_streak, normal_max_streak)
     VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE
       normal_current_streak = VALUES(normal_current_streak),
       normal_max_streak     = VALUES(normal_max_streak)`,
    [userId, currentStreak, maxStreak]
  );
}

async function updateHardStreaks(userId, currentStreak, maxStreak) {
  await pool.execute(
    `INSERT INTO user_achievements (user_id, hard_current_streak, hard_max_streak)
     VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE
       hard_current_streak = VALUES(hard_current_streak),
       hard_max_streak     = VALUES(hard_max_streak)`,
    [userId, currentStreak, maxStreak]
  );
}

async function incrementGodmodeActivations(userId) {
  await pool.execute(
    `INSERT INTO user_achievements (user_id, godmode_activations_count)
     VALUES (?, 1)
     ON DUPLICATE KEY UPDATE
       godmode_activations_count = godmode_activations_count + 1`,
    [userId]
  );
}

module.exports = { createTable, findByUserId, upsert, updateNormalStreaks, updateHardStreaks, incrementGodmodeActivations };
