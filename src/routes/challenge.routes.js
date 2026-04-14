const express = require("express");
const router = express.Router();
const controller = require("../controllers/challenge.controller");

router.post("/create", controller.createRoom);
router.post("/players/seed", controller.seedPlayers);
router.get("/players/list", controller.getPlayers);
router.get("/:code/result", controller.getRoomResult);
router.get("/:code", controller.getRoomInfo);

module.exports = router;
