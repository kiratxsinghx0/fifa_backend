const router = require("express").Router();
const hardmodeLiveStatsController = require("../controllers/hardmode-live-stats.controller");

router.get("/today", hardmodeLiveStatsController.getLatest);
router.get("/day/:day", hardmodeLiveStatsController.getByDay);
router.post("/increment", hardmodeLiveStatsController.incrementAnonymous);

module.exports = router;
