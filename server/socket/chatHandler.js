const chatModel = require("../models/chatModel");
const roomModel = require("../models/roomModel");
const withAck = require("./withAck");
const HttpError = require("../utils/httpError");
const { check } = require("../utils/validate");

const MAX_MESSAGE_LENGTH = 1000;

module.exports = function registerChatHandler(io, socket) {
  const userId = socket.user.id;

  withAck(socket, "chat:send", async ({ roomId, message }) => {
    check(Number.isInteger(roomId), "roomId를 확인해 주세요.");

    const text = typeof message == "string" ? message.trim() : "";

    check(text.length > 0, "메시지를 입력해 주세요.");

    check(
      text.length <= MAX_MESSAGE_LENGTH,
      `메시지는 ${MAX_MESSAGE_LENGTH}자까지 보낼 수 있습니다.`,
    );

    // DB 체크
    if (!(await roomModel.isMember(userId, roomId))) {
      throw new HttpError(403, "참가하지 않은 방입니다.");
    }

    const chat = await chatModel.create({ roomId, userId, message: text });

    await chatModel.markRead(userId, roomId, chat.id); // 읽은 채팅
    await roomModel.touchActivity([roomId]); // 일정 기간 비활성화 방 삭제

    io.to(`room:${roomId}`).emit("chat:new", chat);

    for (const memberId of await roomModel.findMemberIds(roomId)) {
      if (memberId != userId) {
        io.to(`user:${memberId}`).emit("chat:notify", {
          roomId,
          chatId: chat.id,
          name: chat.name,
        });
      }
    }

    return { chat };
  });
};
