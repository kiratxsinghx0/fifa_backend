const { pool } = require("../config/db");

const CREATE_TABLE = "\
  CREATE TABLE IF NOT EXISTS weekly_winners (\
    id          INT AUTO_INCREMENT PRIMARY KEY,\
    week_number INT NOT NULL,\
    `rank`      TINYINT NOT NULL,\
    user_id     INT NOT NULL,\
    email       VARCHAR(255) NOT NULL,\
    games_won   INT NOT NULL DEFAULT 0,\
    points      INT NOT NULL DEFAULT 0,\
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,\
    UNIQUE KEY uk_week_rank (week_number, `rank`),\
    FOREIGN KEY (user_id) REFERENCES users(id),\
    KEY idx_week (week_number)\
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;\
";

async function createTable() {
  await pool.execute(CREATE_TABLE);
}

async function getLatestWeekNumber() {
  const [rows] = await pool.execute(
    "SELECT COALESCE(MAX(week_number), 0) AS max_week FROM weekly_winners"
  );
  return rows[0].max_week;
}

async function getByWeek(weekNumber) {
  const [rows] = await pool.execute(
    "SELECT * FROM weekly_winners WHERE week_number = ? ORDER BY `rank` ASC",
    [weekNumber]
  );
  return rows;
}

async function insertWinners(weekNumber, winners) {
  for (let i = 0; i < winners.length; i++) {
    const w = winners[i];
    await pool.execute(
      "INSERT INTO weekly_winners (week_number, `rank`, user_id, email, games_won, points) VALUES (?, ?, ?, ?, ?, ?)",
      [weekNumber, i + 1, w.user_id, w.email, w.games_won || 0, w.points || 0]
    );
  }
}

async function findUserInWeek(userId, weekNumber) {
  const [rows] = await pool.execute(
    "SELECT * FROM weekly_winners WHERE user_id = ? AND week_number = ?",
    [userId, weekNumber]
  );
  return rows[0] || null;
}

module.exports = {
  createTable, getLatestWeekNumber, getByWeek, insertWinners, findUserInWeek,
};
