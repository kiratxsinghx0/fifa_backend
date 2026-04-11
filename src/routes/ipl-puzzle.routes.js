const { Router } = require("express");
const controller = require("../controllers/ipl-player.controller");

const router = Router();

router.get("/today",      controller.getTodayPuzzle);
router.get("/today/hard", controller.getHardModeTodayPuzzle);
router.get("/day/:day",   controller.getPuzzleByDay);
router.post("/set",           controller.setDailyPuzzle);
router.post("/set/hard",      controller.setHardModeDailyPuzzle);
router.post("/auto-set/hard", controller.autoSetHardModeDailyPuzzle);

module.exports = router;
