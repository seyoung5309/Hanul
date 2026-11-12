const { createRouter } = require("../http");
const { requireAuth } = require("../middleware/authMiddleware");
const controller = require("../controllers/userController");

const router = createRouter();

// 로그인 없이 사용
router.post("/signup", controller.signup);
router.get("/check", controller.checkDuplicate);
router.post("/login", controller.login);
router.post("/logout", controller.logout);
router.post("/password-reset", controller.requestPasswordReset);
router.put("/password-reset", controller.resetPassword);

// 여기부터 로그인 필요
router.use(requireAuth);

router.get("/me", controller.getMe);
router.patch("/me", controller.updateMe);
router.patch("/me/account", controller.updateAccount);
router.put("/me/password", controller.changePassword);
router.post("/me/img/upload", controller.createImgUpload);
router.put("/me/img", controller.updateImg);
router.patch("/me/visibility", controller.updateVisibility);
router.patch("/me/ranking", controller.updateRankingSetting);
router.post("/me/class", controller.changeClass);
router.delete("/me", controller.withdraw);
router.get("/search", controller.searchUsers);

module.exports = router;
