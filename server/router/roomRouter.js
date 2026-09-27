const express = require("express");
const controller = require("../controllers/roomController");

const router = express.Router();

// 반 메인도 type='class'인 공부방이라 현황 조회(GET /:roomId)를 함께 쓴다.
// 방 안에서 일어난 변화는 소켓 room:updated, 방에서 빠지면 room:removed로 알린다.
router.post("/", controller.createRoom); //                       SR-001 → { id, roomCode }
router.get("/", controller.getMyRooms); //                        내가 참여한 방 목록 (반 메인이 맨 위)
router.post("/join", controller.joinByCode); //                   SR-002 { roomCode }

// /:roomId보다 먼저 등록해야 "invites"가 roomId로 잡히지 않는다.
router.get("/invites", controller.getMyInvites); //               SR-008 받은 초대 목록
router.patch("/invites/:inviteId", controller.answerInvite); //   SR-008 { accept }

router.get("/:roomId", controller.getRoom); //                    SR-003, CL-001 방 정보와 참가자 현황
router.delete("/:roomId", controller.deleteRoom); //              SR-005 방장만
router.patch("/:roomId/owner", controller.changeOwner); //        SR-006 { userId } 방장만
router.delete("/:roomId/members/me", controller.leaveRoom); //    SR-007
router.delete("/:roomId/members/:userId", controller.kickMember); // SR-009 방장만
router.post("/:roomId/invites", controller.inviteUser); //        SR-008 { userId } 방장만

// ----- 채팅 (다음 작업) -----
// CL-002 GET    /:roomId/chats?before=  채팅 이전 기록 (새 메시지는 소켓)
// CL-003 PUT    /:roomId/chats/read     읽음 위치 갱신
// CL-004 POST   /:roomId/chats/:chatId/report  채팅 신고

module.exports = router;
