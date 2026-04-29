/**
 * Sets ranks 6–10 of the latest weekly_winners week to specific test accounts.
 *
 * Usage (from wordle_backend):
 *   node scripts/update-weekly-winners-ranks-6-10.js
 */

require("dotenv").config();
const { pool } = require("../src/config/db");

const RANK_TO_EMAIL = [
  [6, "testuser@gmail.com"],
  [7, "rahul@gmail.com"],
  [8, "shane@gmail.com"],
  [9, "varun@gmail.com"],
  [10, "Tarun@gmail.com"],
];

async function main() {
  const [maxRows] = await pool.execute(
    "SELECT COALESCE(MAX(week_number), 0) AS w FROM weekly_winners"
  );
  const week = parseInt(String(maxRows[0].w), 10);
  if (!week) {
    console.error("No rows in weekly_winners; run a snapshot first.");
    process.exit(1);
  }

  const [pRows] = await pool.execute(
    "SELECT points FROM weekly_winners WHERE week_number = ? AND `rank` = 5",
    [week]
  );
  const rank5Points =
    pRows[0]?.points != null ? parseInt(String(pRows[0].points), 10) : 1000;

  for (const [rank, email] of RANK_TO_EMAIL) {
    const [users] = await pool.execute(
      "SELECT id, email FROM users WHERE LOWER(TRIM(email)) = LOWER(TRIM(?))",
      [email]
    );
    if (!users.length) {
      console.error(`No user found for: ${email}`);
      process.exit(1);
    }
    const u = users[0];
    const [res] = await pool.execute(
      "UPDATE weekly_winners SET user_id = ?, email = ? WHERE week_number = ? AND `rank` = ?",
      [u.id, u.email, week, rank]
    );
    if (res.affectedRows === 0) {
      const points = Math.max(0, rank5Points - (rank - 5) * 5);
      await pool.execute(
        "INSERT INTO weekly_winners (week_number, `rank`, user_id, email, games_won, points) VALUES (?, ?, ?, ?, ?, ?)",
        [week, rank, u.id, u.email, 0, points]
      );
      console.log(`Week ${week} rank ${rank} inserted -> ${u.email} (user_id ${u.id})`);
    } else {
      console.log(`Week ${week} rank ${rank} updated -> ${u.email} (user_id ${u.id})`);
    }
  }

  await pool.end();
  console.log("Done.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
