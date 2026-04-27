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
    normal_last_streak_puzzle_day INT DEFAULT NULL,
    normal_last_result_won        TINYINT(1) DEFAULT NULL,
    hard_last_streak_puzzle_day   INT DEFAULT NULL,
    hard_last_result_won          TINYINT(1) DEFAULT NULL,
    created_at                TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at                TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
`;

async function createTable() {
  await pool.execute(CREATE_TABLE);
  try { await pool.execute("ALTER TABLE user_achievements ADD COLUMN godmode_activations_count INT NOT NULL DEFAULT 0"); } catch { /* already exists */ }
  try { await pool.execute("ALTER TABLE user_achievements ADD COLUMN normal_last_streak_puzzle_day INT DEFAULT NULL"); } catch { /* already exists */ }
  try { await pool.execute("ALTER TABLE user_achievements ADD COLUMN normal_last_result_won TINYINT(1) DEFAULT NULL"); } catch { /* already exists */ }
  try { await pool.execute("ALTER TABLE user_achievements ADD COLUMN hard_last_streak_puzzle_day INT DEFAULT NULL"); } catch { /* already exists */ }
  try { await pool.execute("ALTER TABLE user_achievements ADD COLUMN hard_last_result_won TINYINT(1) DEFAULT NULL"); } catch { /* already exists */ }
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

/** Full normal streak + anchors (incremental save or reconcile). lastPuzzleDay null when user has no rows. */
async function persistNormalStreakAndAnchors(userId, currentStreak, maxStreak, lastPuzzleDay, lastWon) {
  const lastD = lastPuzzleDay != null ? lastPuzzleDay : null;
  const lastW = lastD != null ? (lastWon === true || lastWon === 1 ? 1 : 0) : null;
  await pool.execute(
    `INSERT INTO user_achievements (user_id, normal_current_streak, normal_max_streak, normal_last_streak_puzzle_day, normal_last_result_won)
     VALUES (?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       normal_current_streak = VALUES(normal_current_streak),
       normal_max_streak     = VALUES(normal_max_streak),
       normal_last_streak_puzzle_day = VALUES(normal_last_streak_puzzle_day),
       normal_last_result_won        = VALUES(normal_last_result_won)`,
    [userId, currentStreak, maxStreak, lastD, lastW]
  );
}

/** Full hard streak + anchors. */
async function persistHardStreakAndAnchors(userId, currentStreak, maxStreak, lastPuzzleDay, lastWon) {
  const lastD = lastPuzzleDay != null ? lastPuzzleDay : null;
  const lastW = lastD != null ? (lastWon === true || lastWon === 1 ? 1 : 0) : null;
  await pool.execute(
    `INSERT INTO user_achievements (user_id, hard_current_streak, hard_max_streak, hard_last_streak_puzzle_day, hard_last_result_won)
     VALUES (?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       hard_current_streak = VALUES(hard_current_streak),
       hard_max_streak     = VALUES(hard_max_streak),
       hard_last_streak_puzzle_day = VALUES(hard_last_streak_puzzle_day),
       hard_last_result_won        = VALUES(hard_last_result_won)`,
    [userId, currentStreak, maxStreak, lastD, lastW]
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

module.exports = {
  createTable,
  findByUserId,
  upsert,
  persistNormalStreakAndAnchors,
  persistHardStreakAndAnchors,
  updateNormalStreaks,
  updateHardStreaks,
  incrementGodmodeActivations,
};
