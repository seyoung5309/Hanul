const { createRouter } = require("../http");
const controller = require("../controllers/studyController");

const router = createRouter();

// 실시간 관련 기능은 socket/studyHandler.js)으로 처리함
router.get("/current", controller.getCurrent); // 지금 공부 중인 세션 (없으면 null)

router.get("/summary", controller.getSummary); // 오늘, 이번 주, 이번 달, 누적 공부 시간 불러오기
router.get("/ranking/me", controller.getMyRanking); // 내 랭킹 불러오기 (프로필에 사용)
router.get("/ranking", controller.getRanking); // 랭킹 페이지
router.get("/stats", controller.getStats); // 날짜별로 시간 합계와 과목별 시간 불러오기

module.exports = router;
