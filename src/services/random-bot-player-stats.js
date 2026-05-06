const { pool } = require("../config/db");

const OLD_PLAYER_THRESHOLD = 10;

/**
 * "Old" human = combined daily puzzle plays (normal + hard) ≥ threshold.
 * Guests (no userId) are always treated as new — bots never get to clinch
 * a win against them. Errors fail closed (returns false) for the same
 * reason: when in doubt, don't risk an unfair loss.
 */
async function isOldHumanPlayer(userId, threshold = OLD_PLAYER_THRESHOLD) {
  if (!userId) return false;
  try {
    const [[{ cnt: normalCnt }]] = await pool.execute(
      "SELECT COUNT(*) AS cnt FROM user_game_results WHERE user_id = ?",
      [userId],
    );
    const [[{ cnt: hardCnt }]] = await pool.execute(
      "SELECT COUNT(*) AS cnt FROM ipl_hardmode_user_results WHERE user_id = ?",
      [userId],
    );
    return Number(normalCnt) + Number(hardCnt) >= threshold;
  } catch (err) {
    console.error("[random-bot] isOldHumanPlayer error:", err.message);
    return false;
  }
}

module.exports = {
  OLD_PLAYER_THRESHOLD,
  isOldHumanPlayer,
};
