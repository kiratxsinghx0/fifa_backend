const express = require("express");
const router = express.Router();
const controller = require("../controllers/random.controller");

router.get("/:code/result", controller.getRoomResult);
router.get("/:code", controller.getRoomInfo);

module.exports = router;
