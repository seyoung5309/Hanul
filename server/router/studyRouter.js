const express = require("express");
const controller = require("../controllers/studyController");

const router = express.Router();

// 공부 시작·종료는 실시간 반영이 필요해 소켓(socket/studyHandler.js)으로 처리한다.
router.get("/current", controller.getCurrent); // 지금 공부 중인 세션 (없으면 null)

// ----- 팀원 담당 -----
// ST-004 GET    /summary                오늘·이번 주·이번 달·누적 공부 시간
// ST-005 GET    /ranking?scope=student|class&period=day|week|month|all  랭킹
// ST-006 GET    /stats?from=&to=        기간별 추이, 과목별 비율

module.exports = router;
