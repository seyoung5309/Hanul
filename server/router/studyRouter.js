const express = require("express");
const controller = require("../controllers/studyController");

const router = express.Router();

// 공부 시작·종료는 실시간 반영이 필요해 소켓(socket/studyHandler.js)으로 처리한다.
router.get("/current", controller.getCurrent); // 지금 공부 중인 세션 (없으면 null)

router.get("/summary", controller.getSummary); // ST-004 오늘·이번 주·이번 달·누적 공부 시간
router.get("/ranking/me", controller.getMyRanking); // 프로필: 내 현재 순위와 최고 기록
router.get("/ranking", controller.getRanking); // ST-005 ?scope=student|class&period=day|week|month|all&limit=
router.get("/stats", controller.getStats); //     ST-006 ?from=&to= 날짜별 추이, 과목별 시간

module.exports = router;
