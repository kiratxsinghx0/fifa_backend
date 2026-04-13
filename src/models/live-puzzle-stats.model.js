const { pool } = require("../config/db");

const CREATE_TABLE = `
  CREATE TABLE IF NOT EXISTS live_puzzle_stats (
    puzzle_day    INT PRIMARY KEY,
    total_played  INT NOT NULL DEFAULT 0,
    total_won     INT NOT NULL DEFAULT 0,
    guess_1       INT NOT NULL DEFAULT 0,
    guess_2       INT NOT NULL DEFAULT 0,
    guess_3       INT NOT NULL DEFAULT 0,
    guess_4       INT NOT NULL DEFAULT 0,
    guess_5       INT NOT NULL DEFAULT 0,
    guess_6       INT NOT NULL DEFAULT 0,
    updated_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
`;

async function createTable() {
  await pool.execute(CREATE_TABLE);
  try {
    await pool.execute("ALTER TABLE live_puzzle_stats ADD COLUMN game_starts INT NOT NULL DEFAULT 0");
  } catch { /* column already exists */ }
}

async function findByDay(puzzleDay) {
  const [rows] = await pool.execute(
    "SELECT * FROM live_puzzle_stats WHERE puzzle_day = ?",
    [puzzleDay]
  );
  return rows[0] || null;
}

async function increment(puzzleDay, won, numGuesses) {
  await pool.execute(
    `INSERT INTO live_puzzle_stats (puzzle_day, total_played, total_won,
       guess_1, guess_2, guess_3, guess_4, guess_5, guess_6)
     VALUES (?, 1, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       total_played = total_played + 1,
       total_won    = total_won + VALUES(total_won),
       guess_1      = guess_1 + VALUES(guess_1),
       guess_2      = guess_2 + VALUES(guess_2),
       guess_3      = guess_3 + VALUES(guess_3),
       guess_4      = guess_4 + VALUES(guess_4),
       guess_5      = guess_5 + VALUES(guess_5),
       guess_6      = guess_6 + VALUES(guess_6)`,
    [
      puzzleDay,
      won ? 1 : 0,
      won && numGuesses === 1 ? 1 : 0,
      won && numGuesses === 2 ? 1 : 0,
      won && numGuesses === 3 ? 1 : 0,
      won && numGuesses === 4 ? 1 : 0,
      won && numGuesses === 5 ? 1 : 0,
      won && numGuesses === 6 ? 1 : 0,
    ]
  );
}

async function findLatestDay() {
  const [rows] = await pool.execute(
    `SELECT lps.* FROM live_puzzle_stats lps
     INNER JOIN ipl_daily_puzzles idp ON idp.day = lps.puzzle_day
     WHERE idp.set_at < CURDATE() + INTERVAL 1 DAY
     ORDER BY idp.day DESC
     LIMIT 1`
  );
  return rows[0] || null;
}

async function incrementGameStart(puzzleDay) {
  await pool.execute(
    `INSERT INTO live_puzzle_stats (puzzle_day, game_starts)
     VALUES (?, 1)
     ON DUPLICATE KEY UPDATE game_starts = game_starts + 1`,
    [puzzleDay]
  );
}

module.exports = { createTable, findByDay, increment, incrementGameStart, findLatestDay };
