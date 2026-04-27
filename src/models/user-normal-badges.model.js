const { pool } = require("../config/db");

const CREATE_TABLE = `
  CREATE TABLE IF NOT EXISTS user_normal_badges (
    user_id                 INT NOT NULL PRIMARY KEY,
    streak_7_earned_at      DATETIME(3) DEFAULT NULL,
    streak_15_earned_at     DATETIME(3) DEFAULT NULL,
    streak_30_earned_at     DATETIME(3) DEFAULT NULL,
    streak_50_earned_at     DATETIME(3) DEFAULT NULL,
    streak_100_earned_at    DATETIME(3) DEFAULT NULL,
    stumpd_in_one_count     INT UNSIGNED NOT NULL DEFAULT 0,
    stumpd_in_one_last_at   DATETIME(3) DEFAULT NULL,
    stumpd_in_two_count     INT UNSIGNED NOT NULL DEFAULT 0,
    stumpd_in_two_last_at   DATETIME(3) DEFAULT NULL,
    updated_at              TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
`;

async function createTable() {
  await pool.execute(CREATE_TABLE);
}

async function findByUserId(userId) {
  const [rows] = await pool.execute(
    "SELECT * FROM user_normal_badges WHERE user_id = ?",
    [userId]
  );
  return rows[0] || null;
}

async function ensureRow(userId) {
  await pool.execute(
    "INSERT IGNORE INTO user_normal_badges (user_id) VALUES (?)",
    [userId]
  );
}

/** Stamp streak milestone timestamps once when max_streak crosses each threshold. */
async function applyStreakMilestones(userId, maxStreak) {
  const max = Number(maxStreak);
  if (!Number.isFinite(max) || max < 0) return;
  await ensureRow(userId);
  await pool.execute(
    `UPDATE user_normal_badges SET
      streak_7_earned_at = CASE WHEN ? >= 7 THEN COALESCE(streak_7_earned_at, UTC_TIMESTAMP(3)) ELSE streak_7_earned_at END,
      streak_15_earned_at = CASE WHEN ? >= 15 THEN COALESCE(streak_15_earned_at, UTC_TIMESTAMP(3)) ELSE streak_15_earned_at END,
      streak_30_earned_at = CASE WHEN ? >= 30 THEN COALESCE(streak_30_earned_at, UTC_TIMESTAMP(3)) ELSE streak_30_earned_at END,
      streak_50_earned_at = CASE WHEN ? >= 50 THEN COALESCE(streak_50_earned_at, UTC_TIMESTAMP(3)) ELSE streak_50_earned_at END,
      streak_100_earned_at = CASE WHEN ? >= 100 THEN COALESCE(streak_100_earned_at, UTC_TIMESTAMP(3)) ELSE streak_100_earned_at END
    WHERE user_id = ?`,
    [max, max, max, max, max, userId]
  );
}

/** Increment stumpd-in-one / in-two when a normal win uses 1 or 2 guesses. */
async function applyStumpdFromGame(userId, won, numGuesses) {
  if (!won) return;
  const n = Number(numGuesses);
  if (n !== 1 && n !== 2) return;
  await ensureRow(userId);
  if (n === 1) {
    await pool.execute(
      `UPDATE user_normal_badges SET
        stumpd_in_one_count = stumpd_in_one_count + 1,
        stumpd_in_one_last_at = UTC_TIMESTAMP(3)
      WHERE user_id = ?`,
      [userId]
    );
  } else {
    await pool.execute(
      `UPDATE user_normal_badges SET
        stumpd_in_two_count = stumpd_in_two_count + 1,
        stumpd_in_two_last_at = UTC_TIMESTAMP(3)
      WHERE user_id = ?`,
      [userId]
    );
  }
}

/**
 * After a normal save: update streak milestones from max_streak and optionally bump stumpd counts.
 * @param {{ maxStreak: number, won: boolean, numGuesses: number }} opts
 */
async function applyAfterNormalGame(userId, { maxStreak, won, numGuesses }) {
  const maxSafe = Number.isFinite(Number(maxStreak)) && Number(maxStreak) >= 0 ? Number(maxStreak) : 0;
  const incOne = won && numGuesses === 1 ? 1 : 0;
  const incTwo = won && numGuesses === 2 ? 1 : 0;
  await ensureRow(userId);
  await pool.execute(
    `UPDATE user_normal_badges SET
      streak_7_earned_at = CASE WHEN ? >= 7 THEN COALESCE(streak_7_earned_at, UTC_TIMESTAMP(3)) ELSE streak_7_earned_at END,
      streak_15_earned_at = CASE WHEN ? >= 15 THEN COALESCE(streak_15_earned_at, UTC_TIMESTAMP(3)) ELSE streak_15_earned_at END,
      streak_30_earned_at = CASE WHEN ? >= 30 THEN COALESCE(streak_30_earned_at, UTC_TIMESTAMP(3)) ELSE streak_30_earned_at END,
      streak_50_earned_at = CASE WHEN ? >= 50 THEN COALESCE(streak_50_earned_at, UTC_TIMESTAMP(3)) ELSE streak_50_earned_at END,
      streak_100_earned_at = CASE WHEN ? >= 100 THEN COALESCE(streak_100_earned_at, UTC_TIMESTAMP(3)) ELSE streak_100_earned_at END,
      stumpd_in_one_count = stumpd_in_one_count + ?,
      stumpd_in_one_last_at = IF(? = 1, UTC_TIMESTAMP(3), stumpd_in_one_last_at),
      stumpd_in_two_count = stumpd_in_two_count + ?,
      stumpd_in_two_last_at = IF(? = 1, UTC_TIMESTAMP(3), stumpd_in_two_last_at)
    WHERE user_id = ?`,
    [maxSafe, maxSafe, maxSafe, maxSafe, maxSafe, incOne, incOne, incTwo, incTwo, userId]
  );
}

module.exports = {
  createTable,
  findByUserId,
  ensureRow,
  applyStreakMilestones,
  applyStumpdFromGame,
  applyAfterNormalGame,
};
