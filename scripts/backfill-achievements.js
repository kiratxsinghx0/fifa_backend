/**
 * One-time migration script: backfill user_achievements for all existing users.
 *
 * Recomputes normal & hard mode streaks from actual game result rows and
 * preserves the old baseline_max_streak as a floor for normal_max_streak.
 *
 * Usage:
 *   cd wordle_backend
 *   node scripts/backfill-achievements.js
 */

require("dotenv").config();
const { pool } = require("../src/config/db");
const UserGameResultModel = require("../src/models/user-game-result.model");
const UserHardModeResultModel = require("../src/models/user-hard-mode-result.model");
const UserAchievementsModel = require("../src/models/user-achievements.model");

function computeStats(rows) {
  let currentStreak = 0;
  let maxStreak = 0;
  let streak = 0;

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const prev = rows[i - 1];
    const isConsecutiveDay = prev ? r.puzzle_day === prev.puzzle_day + 1 : true;

    if (r.won && isConsecutiveDay) {
      streak++;
      if (streak > maxStreak) maxStreak = streak;
    } else if (r.won) {
      streak = 1;
      if (streak > maxStreak) maxStreak = streak;
    } else {
      streak = 0;
    }
  }
  currentStreak = streak;
  return { currentStreak, maxStreak };
}

async function main() {
  try {
    await UserAchievementsModel.createTable();

    const [users] = await pool.execute("SELECT id, baseline_max_streak FROM users");
    console.log(`Found ${users.length} users to backfill.`);

    let updated = 0;
    let skipped = 0;

    for (const user of users) {
      try {
        const [normalRows, hardRows] = await Promise.all([
          UserGameResultModel.getStatsByUser(user.id),
          UserHardModeResultModel.getStatsByUser(user.id),
        ]);

        const normalStats = computeStats(normalRows);
        const hardStats = computeStats(hardRows);

        const oldBaselineMaxStreak = user.baseline_max_streak || 0;

        await UserAchievementsModel.upsert(user.id, {
          normalCurrentStreak: normalStats.currentStreak,
          normalMaxStreak: Math.max(normalStats.maxStreak, oldBaselineMaxStreak),
          hardCurrentStreak: hardStats.currentStreak,
          hardMaxStreak: hardStats.maxStreak,
        });

        updated++;
        if (updated % 100 === 0) {
          console.log(`  ... processed ${updated}/${users.length}`);
        }
      } catch (err) {
        console.error(`  Error for user ${user.id}: ${err.message}`);
        skipped++;
      }
    }

    console.log(`\nDone. Updated: ${updated}, Skipped: ${skipped}`);
  } catch (err) {
    console.error("Fatal error:", err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
