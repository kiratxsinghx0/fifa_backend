/**
 * One-time migration: backfill user_archive_results from user_game_results.
 *
 * Copies every daily puzzle result into the archive table so existing users
 * see stars on the archive calendar for puzzles they already played.
 *
 * Safe to run multiple times — ON DUPLICATE KEY UPDATE prevents duplicates.
 *
 * Usage:
 *   cd wordle_backend
 *   node scripts/backfill-archive-results.js
 */

require("dotenv").config();
const { pool } = require("../src/config/db");
const UserArchiveResultModel = require("../src/models/user-archive-result.model");

async function main() {
  try {
    await UserArchiveResultModel.createTable();

    const [result] = await pool.execute(`
      INSERT INTO user_archive_results (user_id, puzzle_day, won, played_at)
      SELECT user_id, puzzle_day, won, played_at
      FROM user_game_results
      ON DUPLICATE KEY UPDATE won = VALUES(won)
    `);

    console.log(`Done. Rows affected: ${result.affectedRows}`);
  } catch (err) {
    console.error("Fatal error:", err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
