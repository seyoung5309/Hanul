const express = require("express");
const { requireAdmin } = require("../middleware/authMiddleware");
const controller = require("../controllers/notificationController");

const router = express.Router();

// 새 알림은 소켓 notification:new로도 온다.
router.get("/", controller.getNotifications); //                       NT-001 ?before=&type=&unread=true
router.get("/unread-count", controller.getUnreadCount); //             NT-002 { total, notice, schedule, study_room }
router.patch("/read-all", controller.markAllRead); //                  NT-002 ?type=
router.get("/settings", controller.getSettings); //                    NT-004
router.patch("/settings", controller.updateSettings); //               NT-004 { notice?, schedule?, study_room? }
router.post("/notice", requireAdmin, controller.sendNotice); //        NT-005 { title, descript } 관리자만
router.patch("/:notificationId/read", controller.markRead); //         NT-002, NT-003

module.exports = router;
