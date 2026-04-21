const router = require("express").Router();
const rewardsController = require("../controllers/rewards.controller");
const { authRequired } = require("../middleware/auth");

// Player endpoints
router.get("/eligibility", authRequired, rewardsController.getEligibility);
router.post("/claim", authRequired, rewardsController.claimReward);
router.get("/status", authRequired, rewardsController.getClaimStatus);
router.get("/winners", rewardsController.getWeeklyWinners);

// Admin endpoints
router.get("/admin/pending", rewardsController.adminGetPending);
router.post("/admin/update", rewardsController.adminUpdateStatus);
router.post("/admin/snapshot", rewardsController.adminTriggerSnapshot);

module.exports = router;
