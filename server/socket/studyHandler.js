const studyModel = require("../models/studyModel");
const roomModel = require("../models/roomModel");
const studyService = require("../services/studyService");
const withAck = require("./withAck");
const HttpError = require("../utils/httpError");
const { check } = require("../utils/validate");

// 공부 상태 실시간 공유 (ST-001, ST-002, ST-003, SR-003, SR-012)
//
// 클라이언트 → 서버 (모두 콜백으로 { ok, message? } 응답)
//   room:enter      { roomId }     방 화면 입장. 참가자만 가능 (NF-005)
//   room:leave      { roomId }     방 화면 퇴장
//   study:start     { subjectId, roomId }  공부 시작. 이 방 하나에서만 기록한다.
//                   공부는 한 번에 한 방에서만 한다. 다른 방에 들어가도 그 방에는 기록하지 않고,
//                   방 화면을 떠나도(다른 페이지) 세션이 끝날 때까지 시작한 방의 기록이 이어진다.
//   study:stop                     공부 종료
//   study:heartbeat                30초마다 전송. 2분 넘게 끊기면 자동 종료
//   study:confirm                  3시간 확인 창의 '응답' 버튼
//
// 서버 → 클라이언트
//   study:status  { roomId, userId, studying, subjectId, startedAt }  방 참가자 전체 (공개 범위에 따라)
//   study:session { session, reason }   내 모든 탭. session이 null이면 종료 (reason: stopped | disconnected | no-response)
//   study:check   { deadline }          3시간 확인 창 표시. deadline까지 study:confirm이 없으면 종료
module.exports = function registerStudyHandler(io, socket) {
  const userId = socket.user.id;
  socket.data.rooms = new Set();

  async function requireSession() {
    const session = await studyModel.findActiveSession(userId);
    if (!session) throw new HttpError(400, "공부 중이 아닙니다.");
    return session;
  }

  withAck(socket, "room:enter", async ({ roomId }) => {
    check(Number.isInteger(roomId), "roomId를 확인해 주세요.");
    if (!(await roomModel.isMember(userId, roomId))) throw new HttpError(403, "참가하지 않은 방입니다.");

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
    check(Number.isInteger(roomId) && socket.data.rooms.has(roomId), "공부할 방에 들어가서 시작해 주세요.");
    const session = await studyService.startSession(io, userId, subjectId, [roomId]);
    return { session };
  });

  withAck(socket, "study:stop", async () => {
    const session = await requireSession();
    await studyService.endSession(io, session.id, { status: "종료", reason: "stopped" });
  });

  withAck(socket, "study:heartbeat", async () => {
    const session = await studyModel.findActiveSession(userId);
    if (session) await studyModel.touchHeartbeat(session.id);
    return { studying: session !== null };
  });

  withAck(socket, "study:confirm", async () => {
    const session = await requireSession();
    await studyModel.confirmCheck(session.id);
  });

  // 연결이 끊겨도(새로고침, 다른 페이지) 세션과 방 기록은 그대로 둔다.
  // 모든 창을 닫아 heartbeat가 2분 넘게 끊기면 자동 종료 작업이 끝낸다.
};
