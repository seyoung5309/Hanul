const express = require("express");
const { requireAdmin } = require("../middleware/authMiddleware");

const router = express.Router();

// NT-001 GET    /                       알림 목록
// NT-002 GET    /unread-count           안 읽은 알림 수
// NT-002 PATCH  /:notificationId/read   읽음 처리
// NT-002 PATCH  /read-all               모두 읽음
// NT-004 GET    /settings               알림 설정
// NT-004 PATCH  /settings               알림 설정 변경
// NT-005 POST   /notice                 공지 발송 (관리자)
//   router.post("/notice", requireAdmin, controller.sendNotice);

module.exports = router;
