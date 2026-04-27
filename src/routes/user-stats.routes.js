const router = require("express").Router();
const userStatsController = require("../controllers/user-stats.controller");
const { authRequired } = require("../middleware/auth");

router.get("/stats", authRequired, userStatsController.getMyStats);
router.get("/badges", authRequired, userStatsController.getMyBadges);
router.post("/result", authRequired, userStatsController.saveResult);
router.post("/sync-results", authRequired, userStatsController.syncResults);
router.get("/leaderboard/today", userStatsController.todayLeaderboard);
router.get("/leaderboard/weekly", userStatsController.weeklyLeaderboard);
router.get("/leaderboard/last-week", userStatsController.lastWeekLeaderboard);
router.get("/leaderboard/monthly", userStatsController.monthlyLeaderboard);
router.get("/leaderboard/all-time", userStatsController.allTimeLeaderboard);

router.post("/save-progress", authRequired, userStatsController.saveProgress);
router.get("/game-progress", authRequired, userStatsController.getProgress);

router.post("/godmode", authRequired, userStatsController.activateGodmode);
router.get("/preferences", authRequired, userStatsController.getPreferences);
router.post("/preferences", authRequired, userStatsController.updatePreferences);

router.post("/hard-mode/result", authRequired, userStatsController.saveHardModeResult);
router.get("/hard-mode/stats", authRequired, userStatsController.getMyHardModeStats);
router.post("/hard-mode/sync-results", authRequired, userStatsController.syncHardModeResults);
router.get("/leaderboard/hard-mode/today", userStatsController.todayHardModeLeaderboard);
router.get("/leaderboard/hard-mode/weekly", userStatsController.weeklyHardModeLeaderboard);
router.get("/leaderboard/hard-mode/monthly", userStatsController.monthlyHardModeLeaderboard);
router.get("/leaderboard/hard-mode/all-time", userStatsController.allTimeHardModeLeaderboard);

router.post("/archive/result", authRequired, userStatsController.saveArchiveResult);
router.get("/archive/played", authRequired, userStatsController.getArchivePlayed);

module.exports = router;
