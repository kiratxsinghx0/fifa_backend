const { pool } = require("../config/db");

const CREATE_USERS_TABLE = `
  CREATE TABLE IF NOT EXISTS users (
    id            INT AUTO_INCREMENT PRIMARY KEY,
    email         VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
`;

async function createTable() {
  await pool.execute(CREATE_USERS_TABLE);
}

async function findByEmail(email) {
  const [rows] = await pool.execute(
    "SELECT * FROM users WHERE email = ?",
    [email.trim().toLowerCase()]
  );
  return rows[0] || null;
}

async function findById(id) {
  const [rows] = await pool.execute("SELECT * FROM users WHERE id = ?", [id]);
  return rows[0] || null;
}

async function create(email, passwordHash) {
  const [result] = await pool.execute(
    "INSERT INTO users (email, password_hash) VALUES (?, ?)",
    [email.trim().toLowerCase(), passwordHash]
  );
  return { id: result.insertId, email: email.trim().toLowerCase() };
}

module.exports = { createTable, findByEmail, findById, create };
