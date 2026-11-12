const { createRouter } = require("../http");
const controller = require("../controllers/roomController");
const chatController = require("../controllers/chatController");

const router = createRouter();

router.post("/", controller.createRoom); // 방 생성 { id, roomCode }
router.get("/", controller.getMyRooms); // 내가 참여한 방 목록 (반 메인이 맨 위)
router.post("/join", controller.joinByCode); // 코드로 스터디룸 참여 { roomCode }

// 초대 <- 일단 기획서에 있어서 구현은 했는데 디자인에 까먹고 안 넣어서 생략됨
router.get("/invites", controller.getMyInvites); // 초대 목록 확인
router.patch("/invites/:inviteId", controller.answerInvite); // 초대에 반응하기 (승락 or 거절) { accept }
router.post("/:roomId/invites", controller.inviteUser); // 초대 보내기

// 채팅
router.get("/unread", chatController.getUnreadCounts); // { roomId: 안 읽은 수 }

// 스터디룸
router.get("/:roomId", controller.getRoom); // 방 정보와 참가자 현황 불러오기
router.delete("/:roomId", controller.deleteRoom); // 방장이 스터디룸 삭제
router.patch("/:roomId/owner", controller.changeOwner); // 방장이 다른 사용자한테 방장 넘겨주기 { userId }
router.post("/:roomId/img/upload", controller.createImgUpload); // Cloudinary에 썸네일 업로드 (Cloudinary 서명)
router.put("/:roomId/img", controller.updateImg); // 업로드된 썸네일 저장 { url }
router.delete("/:roomId/members/me", controller.leaveRoom); // 스터디룸 떠나기
router.delete("/:roomId/members/:userId", controller.kickMember); // 방장이 참여자 강퇴

//  채팅 (보내기는 소켓 chat:send)
router.get("/:roomId/chats", chatController.getChats); // 이전 기록 30개씩 반환
router.put("/:roomId/chats/read", chatController.markRead); // 읽은 부분 불러오기 { chatId }

// 웹 사이트에 신고 디자인이 구현이 안되서 신고 기능 작동을 못시킴...
router.post("/:roomId/chats/:chatId/report", chatController.reportChat); // 채팅 신고하기 { reason }

module.exports = router;
