const studyModel = require("../models/studyModel");
const roomModel = require("../models/roomModel");
const studyService = require("../services/studyService");
const withAck = require("./withAck");
const HttpError = require("../utils/httpError");
const { check } = require("../utils/validate");

module.exports = function registerStudyHandler(io, socket) {
  const userId = socket.user.id;
  socket.data.rooms = new Set();

  async function requireSession() {
    const session = await studyModel.findActiveSession(userId);

    if (!session) {
      throw new HttpError(400, "공부 중이 아닙니다.");
    }

    return session;
  }

  withAck(socket, "room:enter", async ({ roomId }) => {
    check(Number.isInteger(roomId), "roomId를 확인해 주세요.");

    if (!(await roomModel.isMember(userId, roomId))) {
      throw new HttpError(403, "참가하지 않은 방입니다.");
    }

    socket.join(`room:${roomId}`);
    socket.data.rooms.add(roomId);
  });

  withAck(socket, "room:leave", async ({ roomId }) => {
    check(Number.isInteger(roomId), "roomId를 확인해 주세요.");

    socket.leave(`room:${roomId}`);
    socket.data.rooms.delete(roomId);
  });

  withAck(socket, "study:start", async ({ subjectId, roomId }) => {
    check(Number.isInteger(subjectId), "과목을 선택해 주세요.");

    check(
      Number.isInteger(roomId) && socket.data.rooms.has(roomId),
      "공부할 방에 들어가서 시작해 주세요.",
    );

    const session = await studyService.startSession(io, userId, subjectId, [
      roomId,
    ]);

    return { session };
  });

  withAck(socket, "study:stop", async () => {
    const session = await requireSession();

    await studyService.endSession(io, session.id, {
      status: "종료",
      reason: "stopped",
    });
  });

  withAck(socket, "study:heartbeat", async () => {
    const session = await studyModel.findActiveSession(userId);

    if (session) {
      await studyModel.touchHeartbeat(session.id);
    }

    return { studying: session !== null };
  });

  withAck(socket, "study:confirm", async () => {
    const session = await requireSession();

    await studyModel.confirmCheck(session.id);
  });
};
