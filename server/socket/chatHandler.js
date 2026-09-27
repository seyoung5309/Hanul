const chatModel = require("../models/chatModel");
const roomModel = require("../models/roomModel");
const withAck = require("./withAck");
const HttpError = require("../utils/httpError");
const { check } = require("../utils/validate");

const MAX_MESSAGE_LENGTH = 1000;

// 반·공부방 채팅 (CL-002, SR-004, SR-011)
//
// 클라이언트 → 서버 (콜백으로 { ok, chat? , message? } 응답)
//   chat:send   { roomId, message }   참가자만 가능 (NF-005)
//
// 서버 → 클라이언트
//   chat:new    { id, roomId, userId, name, identifier, img, message, time }   room:{roomId} (방 화면을 보고 있는 사람)
//   chat:notify { roomId, chatId, name }   보낸 사람을 뺀 참가자 전체의 user:{userId} (방별 새 채팅 알림, SR-011)
//
// 메시지는 받은 그대로 저장하고, 화면에 넣을 때 textContent로 출력해 XSS를 막는다. (NF-004)
module.exports = function registerChatHandler(io, socket) {
  const userId = socket.user.id;

  withAck(socket, "chat:send", async ({ roomId, message }) => {
    check(Number.isInteger(roomId), "roomId를 확인해 주세요.");
    const text = typeof message === "string" ? message.trim() : "";
    check(text.length > 0, "메시지를 입력해 주세요.");
    check(text.length <= MAX_MESSAGE_LENGTH, `메시지는 ${MAX_MESSAGE_LENGTH}자까지 보낼 수 있습니다.`);

    // 내보내진 뒤에도 소켓 방 채널에 남아 있을 수 있으므로 DB로 확인한다.
    if (!(await roomModel.isMember(userId, roomId))) throw new HttpError(403, "참가하지 않은 방입니다.");

    const chat = await chatModel.create({ roomId, userId, message: text });
    await chatModel.markRead(userId, roomId, chat.id); // 내가 보낸 채팅까지는 읽은 것
    await roomModel.touchActivity([roomId]); // SR-010 활동 기준

    io.to(`room:${roomId}`).emit("chat:new", chat);
    for (const memberId of await roomModel.findMemberIds(roomId)) {
      if (memberId !== userId) io.to(`user:${memberId}`).emit("chat:notify", { roomId, chatId: chat.id, name: chat.name });
    }
    return { chat };
  });
};
