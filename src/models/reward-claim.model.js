const { pool } = require("../config/db");

const CREATE_TABLE = "\
  CREATE TABLE IF NOT EXISTS reward_claims (\
    id                   INT AUTO_INCREMENT PRIMARY KEY,\
    week_number          INT NOT NULL,\
    user_id              INT NOT NULL,\
    `rank`               TINYINT NOT NULL,\
    amount               INT NOT NULL,\
    instagram_username   VARCHAR(100) NOT NULL,\
    reddit_username      VARCHAR(100) NOT NULL,\
    upi_id               VARCHAR(255) NOT NULL,\
    insta_follow_done    TINYINT(1) NOT NULL DEFAULT 0,\
    reddit_follow_done   TINYINT(1) NOT NULL DEFAULT 0,\
    insta_story_done     TINYINT(1) NOT NULL DEFAULT 0,\
    reddit_post_done     TINYINT(1) NOT NULL DEFAULT 0,\
    status               ENUM('pending','verified','paid','rejected') DEFAULT 'pending',\
    claimed_at           TIMESTAMP DEFAULT CURRENT_TIMESTAMP,\
    paid_at              TIMESTAMP NULL DEFAULT NULL,\
    admin_notes          TEXT DEFAULT NULL,\
    UNIQUE KEY uk_user_week (user_id, week_number),\
    FOREIGN KEY (user_id) REFERENCES users(id),\
    KEY idx_week (week_number),\
    KEY idx_status (status)\
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;\
";

/** Older DBs: add checklist columns if missing (ignored when already present). */
const ALTER_ADD_CHECKLIST = [
  "ALTER TABLE reward_claims ADD COLUMN insta_follow_done TINYINT(1) NOT NULL DEFAULT 0",
  "ALTER TABLE reward_claims ADD COLUMN reddit_follow_done TINYINT(1) NOT NULL DEFAULT 0",
  "ALTER TABLE reward_claims ADD COLUMN insta_story_done TINYINT(1) NOT NULL DEFAULT 0",
  "ALTER TABLE reward_claims ADD COLUMN reddit_post_done TINYINT(1) NOT NULL DEFAULT 0",
];

const REWARD_AMOUNTS = { 1: 50, 2: 50, 3: 50, 4: 50, 5: 50, 6: 50, 7: 50, 8: 50, 9: 50, 10: 50 };

async function createTable() {
  await pool.execute(CREATE_TABLE);
  for (const sql of ALTER_ADD_CHECKLIST) {
    try {
      await pool.execute(sql);
    } catch (e) {
      if (e.code !== "ER_DUP_FIELDNAME") throw e;
    }
  }
}

async function findByUserAndWeek(userId, weekNumber) {
  const [rows] = await pool.execute(
    "SELECT * FROM reward_claims WHERE user_id = ? AND week_number = ?",
    [userId, weekNumber]
  );
  return rows[0] || null;
}

async function create({
  user_id,
  week_number,
  rank,
  instagram_username,
  reddit_username,
  upi_id,
  insta_follow_done,
  reddit_follow_done,
  insta_story_done,
  reddit_post_done,
}) {
  const amount = REWARD_AMOUNTS[rank];
  if (!amount) throw new Error("Invalid rank for reward");
  const ig = insta_follow_done ? 1 : 0;
  const rf = reddit_follow_done ? 1 : 0;
  const is = insta_story_done ? 1 : 0;
  const rp = reddit_post_done ? 1 : 0;
  const [out] = await pool.execute(
    "INSERT INTO reward_claims (week_number, user_id, `rank`, amount, instagram_username, reddit_username, upi_id, insta_follow_done, reddit_follow_done, insta_story_done, reddit_post_done) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    [week_number, user_id, rank, amount, instagram_username, reddit_username, upi_id, ig, rf, is, rp]
  );
  return { id: out.insertId, amount };
}

async function updateByUserAndWeek(
  userId,
  weekNumber,
  { instagram_username, reddit_username, upi_id, insta_follow_done, reddit_follow_done, insta_story_done, reddit_post_done }
) {
  const ig = insta_follow_done ? 1 : 0;
  const rf = reddit_follow_done ? 1 : 0;
  const is = insta_story_done ? 1 : 0;
  const rp = reddit_post_done ? 1 : 0;
  const [out] = await pool.execute(
    `UPDATE reward_claims SET instagram_username = ?, reddit_username = ?, upi_id = ?,
     insta_follow_done = ?, reddit_follow_done = ?, insta_story_done = ?, reddit_post_done = ?
     WHERE user_id = ? AND week_number = ?`,
    [instagram_username, reddit_username, upi_id, ig, rf, is, rp, userId, weekNumber]
  );
  return out.affectedRows > 0;
}

async function getByWeek(weekNumber) {
  const [rows] = await pool.execute(
    "SELECT * FROM reward_claims WHERE week_number = ? ORDER BY `rank` ASC",
    [weekNumber]
  );
  return rows;
}

async function getPending() {
  const [rows] = await pool.execute(
    "SELECT * FROM reward_claims WHERE status = 'pending' ORDER BY week_number DESC, `rank` ASC"
  );
  return rows;
}

async function updateStatus(id, status, notes) {
  const tsCol = status === "paid" ? ", paid_at = NOW()" : "";
  await pool.execute(
    `UPDATE reward_claims SET status = ?${tsCol}, admin_notes = ? WHERE id = ?`,
    [status, notes || null, id]
  );
}

module.exports = {
  createTable, findByUserAndWeek, create, updateByUserAndWeek,
  getByWeek, getPending, updateStatus, REWARD_AMOUNTS,
};
