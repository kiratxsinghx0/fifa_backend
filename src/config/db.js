const mysql = require("mysql2/promise");
require("dotenv").config();

const pool = mysql.createPool({
  host: process.env.MYSQLHOST,
  port: parseInt(process.env.MYSQLPORT, 10) || 3306,
  user: process.env.MYSQLUSER,
  password: process.env.MYSQLPASSWORD,
  database: process.env.MYSQL_DATABASE,
  waitForConnections: true,
  connectionLimit: 30,
  queueLimit: 0,
  ssl: {
    rejectUnauthorized: false,
  },
});

async function testConnection() {
  try {
    const connection = await pool.getConnection();
    console.log("MySQL connected successfully");
    connection.release();
  } catch (err) {
    console.error("MySQL connection failed:--------------------------------", err.message);
    process.exit(1);
  }
}

module.exports = { pool, testConnection };
