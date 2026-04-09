const { Router } = require("express");
const controller = require("../controllers/player.controller");

const router = Router();

router.get("/",           controller.getAllPlayers);
router.get("/name/:name", controller.getPlayerByName);
router.get("/:id",        controller.getPlayerById);
router.post("/seed",     controller.seedPlayers);

module.exports = router;
