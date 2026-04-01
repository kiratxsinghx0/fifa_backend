const { Router } = require("express");
const controller = require("../controllers/player.controller");

const router = Router();

router.get("/today",    controller.getTodayPuzzle);
router.get("/day/:day", controller.getPuzzleByDay);
router.post("/set",     controller.setDailyPuzzle);

module.exports = router;
