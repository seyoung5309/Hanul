const express = require("express");
const controller = require("../controllers/aiController");

const router = express.Router();

// Google Gemini 사용. AI를 부르는 요청은 하루 사용 횟수에 포함된다. (AI-003)
router.get("/usage", controller.getUsage); //                          AI-003 오늘 남은 사용량
router.get("/rooms", controller.getRooms); //                          AI-006 대화방 목록
router.post("/rooms", controller.createRoom); //                       AI-006 { title? }
router.get("/rooms/:aiRoomId", controller.getRoom); //                 AI-006 대화 기록
router.delete("/rooms/:aiRoomId", controller.deleteRoom); //           AI-006
router.post("/rooms/:aiRoomId/chats", controller.chat); //             AI-005 { message } 질문 → 답변
router.post("/plans", controller.createPlan); //                       AI-001 { roomId?, exams, availableTime, tasks }
router.post("/plans/regenerate", controller.regeneratePlan); //        AI-004 { roomId, plan, feedback }
router.post("/plans/apply", controller.applyPlan); //                  AI-002 { schedules, todos } → 일정·To Do 저장

module.exports = router;
