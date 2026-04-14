require("dotenv").config();
const express = require("express");
const http = require("http");
const cors = require("cors");
const cron = require("node-cron");
const { Server: SocketIOServer } = require("socket.io");
const { testConnection } = require("./src/config/db");
const PlayerModel = require("./src/models/player.model");
const DailyPuzzleModel = require("./src/models/daily-puzzle.model");
const IplPlayerModel = require("./src/models/ipl-player.model");
const IplDailyPuzzleModel = require("./src/models/ipl-daily-puzzle.model");
const ScheduleIplPuzzleModel = require("./src/models/schedule-ipl-puzzle.model");
const IplHardmodeDailyPuzzleModel = require("./src/models/ipl-hardmode-daily-puzzle.model");
const ScheduleIplHardmodePuzzleModel = require("./src/models/schedule-ipl-hardmode-puzzle.model");
const iplPlayerService = require("./src/services/ipl-player.service");
const playerRoutes = require("./src/routes/player.routes");
const puzzleRoutes = require("./src/routes/puzzle.routes");
const iplPlayerRoutes = require("./src/routes/ipl-player.routes");
const iplPuzzleRoutes = require("./src/routes/ipl-puzzle.routes");
const iplScheduleRoutes = require("./src/routes/ipl-schedule.routes");
const iplHardmodeScheduleRoutes = require("./src/routes/ipl-hardmode-schedule.routes");
const authRoutes = require("./src/routes/auth.routes");
const userStatsRoutes = require("./src/routes/user-stats.routes");
const liveStatsRoutes = require("./src/routes/live-stats.routes");
const hardmodeLiveStatsRoutes = require("./src/routes/hardmode-live-stats.routes");
const challengeRoutes = require("./src/routes/challenge.routes");
const UserModel = require("./src/models/user.model");
const UserGameResultModel = require("./src/models/user-game-result.model");
const UserHardModeResultModel = require("./src/models/user-hard-mode-result.model");
const LivePuzzleStatsModel = require("./src/models/live-puzzle-stats.model");
const HardmodeLivePuzzleStatsModel = require("./src/models/hardmode-live-puzzle-stats.model");
const GameProgressModel = require("./src/models/ipl-game-progress.model");
const HardModeGameProgressModel = require("./src/models/ipl-hardmode-game-progress.model");
const UserAchievementsModel = require("./src/models/user-achievements.model");
const ChallengePlayerModel = require("./src/models/challenge-player.model");
const ChallengeRoomModel = require("./src/models/challenge-room.model");
const ChallengeGuessModel = require("./src/models/challenge-guess.model");
const { initChallengeSocket } = require("./src/socket/challenge-socket");

const app = express();
const httpServer = http.createServer(app);
const PORT = process.env.PORT || 3001;

const io = new SocketIOServer(httpServer, {
  cors: { origin: "*", methods: ["GET", "POST"] },
});

app.use(cors());
app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});
// fifawordle routes
app.use("/api/players", playerRoutes);
app.use("/api/puzzle", puzzleRoutes);
// IPL routes
//ipl insert player routes
app.use("/api/ipl/players", iplPlayerRoutes);
//ipl insert puzzle routes
app.use("/api/ipl/puzzle", iplPuzzleRoutes);
//ipl insert schedule routes
app.use("/api/ipl/schedule", iplScheduleRoutes);
//ipl hard mode schedule routes
app.use("/api/ipl/schedule/hard-mode", iplHardmodeScheduleRoutes);
// Auth & user routes
app.use("/api/auth", authRoutes);
app.use("/api/user", userStatsRoutes);
app.use("/api/live-stats", liveStatsRoutes);
app.use("/api/live-stats/hard-mode", hardmodeLiveStatsRoutes);
app.use("/api/challenge", challengeRoutes);

app.use((_req, res) => {
  res.status(404).json({ success: false, message: "Route not found" });
});

app.use((err, _req, res, _next) => {
  console.error("Unhandled error:", err);
  res.status(500).json({ success: false, message: "Internal server error" });
});

let server;

async function bootstrap() {
  await testConnection();
  await PlayerModel.createTable();
  await DailyPuzzleModel.createTable();
  await IplPlayerModel.createTable();
  await IplDailyPuzzleModel.createTable();
  await ScheduleIplPuzzleModel.createTable();
  await IplHardmodeDailyPuzzleModel.createTable();
  await ScheduleIplHardmodePuzzleModel.createTable();
  await UserModel.createTable();
  await UserGameResultModel.createTable();
  await UserHardModeResultModel.createTable();
  await LivePuzzleStatsModel.createTable();
  await HardmodeLivePuzzleStatsModel.createTable();
  await GameProgressModel.createTable();
  await HardModeGameProgressModel.createTable();
  await UserAchievementsModel.createTable();
  await ChallengePlayerModel.createTable();
  await ChallengeRoomModel.createTable();
  await ChallengeGuessModel.createTable();
  console.log("Database tables ensured");

  initChallengeSocket(io);
  console.log("Socket.IO challenge handler initialized");

  server = httpServer.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });

  // Daily puzzle cron: 6 AM IST = 00:30 UTC → "30 0 * * *"
  cron.schedule("30 0 * * *", async () => {
    console.log("[CRON] Running daily IPL puzzle auto-set at 6 AM IST…");
    try {
      const result = await iplPlayerService.autoSetDailyPuzzle();
      if (result.alreadySet) {
        console.log("[CRON] Puzzle already set for today, skipping.");
      } else {
        console.log(`[CRON] New puzzle set — day ${result.day}`);
      }
    } catch (err) {
      console.error("[CRON] Failed to auto-set daily puzzle:", err.message);
    }
  }, { timezone: "UTC" });
  console.log("Cron job scheduled: daily IPL puzzle at 6 AM IST (00:30 UTC)");

  cron.schedule("31 0 * * *", async () => {
    console.log("[CRON] Running daily IPL hard mode puzzle auto-set at 6:01 AM IST…");
    try {
      const result = await iplPlayerService.autoSetHardModeDailyPuzzle();
      if (result.alreadySet) {
        console.log("[CRON] Hard mode puzzle already set for today, skipping.");
      } else {
        console.log(`[CRON] New hard mode puzzle set — day ${result.day}`);
      }
    } catch (err) {
      console.error("[CRON] Failed to auto-set hard mode daily puzzle:", err.message);
    }
  }, { timezone: "UTC" });
  console.log("Cron job scheduled: daily IPL hard mode puzzle at 6:01 AM IST (00:31 UTC)");

  // Expire stale challenge rooms every 5 minutes
  cron.schedule("*/5 * * * *", async () => {
    try {
      const expired = await ChallengeRoomModel.expireOldRooms(15);
      if (expired > 0) console.log(`[CRON] Expired ${expired} stale challenge rooms`);
    } catch (err) {
      console.error("[CRON] Failed to expire challenge rooms:", err.message);
    }
  });
}

function gracefulShutdown(signal) {
  console.log(`${signal} received — shutting down gracefully`);
  if (server) {
    server.close(() => {
      const { pool } = require("./src/config/db");
      pool.end().then(() => {
        console.log("MySQL pool closed");
        process.exit(0);
      }).catch(() => process.exit(1));
    });
    setTimeout(() => process.exit(1), 10_000);
  } else {
    process.exit(0);
  }
}

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));

bootstrap().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
