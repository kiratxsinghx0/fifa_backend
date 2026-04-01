require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { testConnection } = require("./src/config/db");
const PlayerModel = require("./src/models/player.model");
const DailyPuzzleModel = require("./src/models/daily-puzzle.model");
const playerRoutes = require("./src/routes/player.routes");
const puzzleRoutes = require("./src/routes/puzzle.routes");

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.use("/api/players", playerRoutes);
app.use("/api/puzzle", puzzleRoutes);

app.use((_req, res) => {
  res.status(404).json({ success: false, message: "Route not found" });
});

app.use((err, _req, res, _next) => {
  console.error("Unhandled error:", err);
  res.status(500).json({ success: false, message: "Internal server error" });
});

async function bootstrap() {
    console.log("--------------------------------", process.env.MYSQLHOST);
    console.log("--------------------------------", process.env.MYSQLPORT);
    console.log("--------------------------------", process.env.MYSQLUSER);
    console.log("--------------------------------", process.env.MYSQLPASSWORD);
    console.log("--------------------------------", process.env.MYSQL_DATABASE);
  await testConnection();
  await PlayerModel.createTable();
  await DailyPuzzleModel.createTable();
  console.log("Database tables ensured");

  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

bootstrap().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
