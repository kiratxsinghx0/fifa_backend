const { Router } = require("express");
const controller = require("../controllers/ipl-player.controller");

const router = Router();

router.get("/",           controller.getAllPlayers);
router.get("/count",      controller.getPlayerCount);
router.get("/:id",        controller.getPlayerById);
router.get("/name/:name", controller.getPlayerByName);
router.post("/seed",      controller.seedPlayers);

module.exports = router;
