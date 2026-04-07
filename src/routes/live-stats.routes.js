const router = require("express").Router();
const liveStatsController = require("../controllers/live-stats.controller");

router.get("/today", liveStatsController.getLatest);
router.get("/day/:day", liveStatsController.getByDay);
router.post("/increment", liveStatsController.incrementAnonymous);

module.exports = router;
