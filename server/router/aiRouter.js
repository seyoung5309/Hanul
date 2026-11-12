const { createRouter } = require("../http");
const controller = require("../controllers/aiController");

const router = createRouter();

router.get("/usage", controller.getUsage); // 오늘 남은 사용량
router.get("/rooms", controller.getRooms); // 대화방 목록
router.post("/rooms", controller.createRoom); // 최초 방 생성 { title? }
router.get("/rooms/:aiRoomId", controller.getRoom); // 대화 기록
router.delete("/rooms/:aiRoomId", controller.deleteRoom); // 대화방 삭제
router.post("/rooms/:aiRoomId/chats", controller.chat); // 질문, 답변
router.post("/plans", controller.createPlan); // 일정 생성 { roomId?, exams, availableTime, tasks }
router.post("/plans/regenerate", controller.regeneratePlan); // 이전 계획(일정) 수정{ roomId, plan, feedback }
router.post("/plans/apply", controller.applyPlan); // 일정, To Do 저장 { schedules, todos }

module.exports = router;
