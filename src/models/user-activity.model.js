const { pool } = require("../config/db");

const CREATE_TABLE = `
  CREATE TABLE IF NOT EXISTS user_activity (
    device_id        VARCHAR(64)   NOT NULL,
    user_id          INT           NULL,
    date             DATE          NOT NULL,
    played_daily     TINYINT(1)    NOT NULL DEFAULT 0,
    played_hard      TINYINT(1)    NOT NULL DEFAULT 0,
    played_challenge TINYINT(1)    NOT NULL DEFAULT 0,
    played_archive   TINYINT(1)    NOT NULL DEFAULT 0,
    PRIMARY KEY (device_id, date),
    INDEX idx_ua_date (date),
    INDEX idx_ua_user (user_id, date)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
`;

async function createTable() {
  await pool.execute(CREATE_TABLE);
}

async function upsert(deviceId, userId, mode) {
  const col = {
    daily: "played_daily",
    hard: "played_hard",
    challenge: "played_challenge",
    archive: "played_archive",
  }[mode];
  if (!col) return;

  await pool.execute(
    `INSERT INTO user_activity (device_id, user_id, date, ${col})
     VALUES (?, ?, CURDATE(), 1)
     ON DUPLICATE KEY UPDATE
       ${col} = 1,
       user_id = COALESCE(VALUES(user_id), user_activity.user_id)`,
    [deviceId, userId || null]
  );
}

module.exports = { createTable, upsert };
