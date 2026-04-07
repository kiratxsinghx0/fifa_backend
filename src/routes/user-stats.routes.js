const router = require("express").Router();
const userStatsController = require("../controllers/user-stats.controller");
const { authRequired } = require("../middleware/auth");

router.get("/stats", authRequired, userStatsController.getMyStats);
router.post("/result", authRequired, userStatsController.saveResult);

module.exports = router;
