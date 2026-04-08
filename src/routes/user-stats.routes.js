const router = require("express").Router();
const userStatsController = require("../controllers/user-stats.controller");
const { authRequired } = require("../middleware/auth");

router.get("/stats", authRequired, userStatsController.getMyStats);
router.post("/result", authRequired, userStatsController.saveResult);
router.post("/sync-results", authRequired, userStatsController.syncResults);
router.get("/leaderboard/today", userStatsController.todayLeaderboard);
router.get("/leaderboard/all-time", userStatsController.allTimeLeaderboard);

module.exports = router;
