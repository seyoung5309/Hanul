const express = require("express");
const { requireAuth } = require("../middleware/authMiddleware");
const controller = require("../controllers/userController");

const router = express.Router();

// ----- 로그인 없이 사용 -----
router.post("/signup", controller.signup); //                  UD-001, UD-003
router.get("/check", controller.checkDuplicate); //            UD-002 ?email=&identifier=
router.post("/login", controller.login); //                    UD-004
router.post("/logout", controller.logout); //                  UD-005 (토큰이 만료돼도 로그아웃 가능)
router.post("/password-reset", controller.requestPasswordReset); // UD-006 재설정 메일 발송
router.put("/password-reset", controller.resetPassword); //    UD-006 새 비밀번호 설정

// ----- 여기부터 로그인 필요 -----
router.use(requireAuth);

router.get("/me", controller.getMe); //                        UD-007
router.patch("/me", controller.updateMe); //                   UD-007 한 마디, 관심 과목
router.patch("/me/visibility", controller.updateVisibility); // UD-008
router.patch("/me/ranking", controller.updateRankingSetting); // ST-008
router.post("/me/class", controller.changeClass); //           UD-010
router.delete("/me", controller.withdraw); //                  UD-009
router.get("/search", controller.searchUsers); //              SR-008 ?identifier=

module.exports = router;
