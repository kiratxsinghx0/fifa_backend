/**
 * One-time migration script: backfill user_achievements for all existing users.
 *
 * Recomputes normal & hard mode streaks from actual game result rows,
 * preserves the old baseline_max_streak as a floor for normal_max_streak,
 * and sets streak anchor columns (last puzzle_day + last won) per mode.
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
const UserNormalBadgesModel = require("../src/models/user-normal-badges.model");
const UserHardBadgesModel = require("../src/models/user-hard-badges.model");
const IplDailyPuzzleModel = require("../src/models/ipl-daily-puzzle.model");
const IplHardmodeDailyPuzzleModel = require("../src/models/ipl-hardmode-daily-puzzle.model");

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

function recomputeCurrentStreakWithCalendar(rows, latestPuzzleDay) {
  if (!rows || rows.length === 0) return 0;
  const s = computeStats(rows);
  const last = rows[rows.length - 1];
  if (!last.won) return 0;
  if (latestPuzzleDay != null && latestPuzzleDay - last.puzzle_day > 1) return 0;
  return s.currentStreak;
}

async function main() {
  try {
    await UserAchievementsModel.createTable();
    await UserNormalBadgesModel.createTable();
    await UserHardBadgesModel.createTable();

    const [latestDaily, latestHard] = await Promise.all([
      IplDailyPuzzleModel.findLatest(),
      IplHardmodeDailyPuzzleModel.findLatest(),
    ]);

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
        const normalMax = Math.max(normalStats.maxStreak, oldBaselineMaxStreak);
        const normalCurrent = recomputeCurrentStreakWithCalendar(
          normalRows,
          latestDaily?.day ?? null,
        );
        const hardCurrent = recomputeCurrentStreakWithCalendar(
          hardRows,
          latestHard?.day ?? null,
        );

        const lastN = normalRows.length ? normalRows[normalRows.length - 1] : null;
        const lastH = hardRows.length ? hardRows[hardRows.length - 1] : null;

        await UserAchievementsModel.persistNormalStreakAndAnchors(
          user.id,
          normalCurrent,
          normalMax,
          lastN ? lastN.puzzle_day : null,
          lastN ? (lastN.won === 1 || lastN.won === true) : null,
        );
        await UserAchievementsModel.persistHardStreakAndAnchors(
          user.id,
          hardCurrent,
          hardStats.maxStreak,
          lastH ? lastH.puzzle_day : null,
          lastH ? (lastH.won === 1 || lastH.won === true) : null,
        );

        await UserNormalBadgesModel.applyStreakMilestones(user.id, normalMax);
        await UserHardBadgesModel.applyStreakMilestones(user.id, hardStats.maxStreak);

        const [n1rows] = await pool.execute(
          "SELECT COUNT(*) AS c FROM user_game_results WHERE user_id = ? AND won = 1 AND num_guesses = 1",
          [user.id],
        );
        const [n2rows] = await pool.execute(
          "SELECT COUNT(*) AS c FROM user_game_results WHERE user_id = ? AND won = 1 AND num_guesses = 2",
          [user.id],
        );
        const [h1rows] = await pool.execute(
          "SELECT COUNT(*) AS c FROM ipl_hardmode_user_results WHERE user_id = ? AND won = 1 AND num_guesses = 1",
          [user.id],
        );
        const [h2rows] = await pool.execute(
          "SELECT COUNT(*) AS c FROM ipl_hardmode_user_results WHERE user_id = ? AND won = 1 AND num_guesses = 2",
          [user.id],
        );
        await UserNormalBadgesModel.ensureRow(user.id);
        await UserHardBadgesModel.ensureRow(user.id);
        await pool.execute(
          "UPDATE user_normal_badges SET stumpd_in_one_count = ?, stumpd_in_two_count = ? WHERE user_id = ?",
          [Number(n1rows[0]?.c) || 0, Number(n2rows[0]?.c) || 0, user.id],
        );
        await pool.execute(
          "UPDATE user_hard_badges SET stumpd_in_one_count = ?, stumpd_in_two_count = ? WHERE user_id = ?",
          [Number(h1rows[0]?.c) || 0, Number(h2rows[0]?.c) || 0, user.id],
        );

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
