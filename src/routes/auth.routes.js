const router = require("express").Router();
const authController = require("../controllers/auth.controller");
const { authRequired } = require("../middleware/auth");

router.post("/register", authController.register);
router.post("/login", authController.login);
router.get("/me", authRequired, authController.me);

module.exports = router;
