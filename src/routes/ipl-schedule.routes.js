const { Router } = require("express");
const controller = require("../controllers/ipl-schedule.controller");

const router = Router();

router.get("/",        controller.getAll);
router.get("/queue",   controller.getQueue);
router.post("/add",    controller.addSchedule);
router.post("/bulk",   controller.bulkAddSchedule);

module.exports = router;
