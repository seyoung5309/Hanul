const { createRouter } = require("../http");
const { requireAdmin } = require("../middleware/authMiddleware");
const controller = require("../controllers/notificationController");

const router = createRouter();

// 소켓으로 알림 오기도 함
router.get("/", controller.getNotifications); // 알림 불러오기 ?before=&type=&unread=true
router.get("/unread-count", controller.getUnreadCount); // 안 읽은 알림 개수 { total, notice, schedule, study_room }
router.patch("/read-all", controller.markAllRead); // 모두 읽음 처리
router.get("/settings", controller.getSettings); // 알림 설정 값 불러오기
router.patch("/settings", controller.updateSettings); // 알림 설정 변경 { notice?, schedule?, study_room? }
router.post("/notice", requireAdmin, controller.sendNotice); // 관리자가 공지 보내기 { title, descript }
router.patch("/:notificationId/read", controller.markRead); // 읽음 처리

module.exports = router;
