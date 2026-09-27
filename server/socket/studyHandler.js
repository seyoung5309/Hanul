const studyModel = require("../models/studyModel");
const roomModel = require("../models/roomModel");
const studyService = require("../services/studyService");
const withAck = require("./withAck");
const HttpError = require("../utils/httpError");
const { check } = require("../utils/validate");

// 공부 상태 실시간 공유 (ST-001, ST-002, ST-003, SR-003, SR-012)
//
// 클라이언트 → 서버 (모두 콜백으로 { ok, message? } 응답)
//   room:enter      { roomId }     방 화면 입장. 참가자만 가능 (NF-005). 공부 중이면 이 방 기록 시작
//   room:leave      { roomId }     방 화면 퇴장. 이 방 기록 종료
//   study:start     { subjectId }  공부 시작. 지금 들어가 있는 방마다 기록 시작
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

  // 이 사용자의 모든 탭이 들어가 있는 방 (exceptSelf면 이 탭 제외)
  async function enteredRooms({ exceptSelf = false } = {}) {
    const sockets = await io.in(`user:${userId}`).fetchSockets();
    const rooms = new Set();
    for (const s of sockets) {
      if (exceptSelf && s.id === socket.id) continue;
      s.data.rooms?.forEach((roomId) => rooms.add(roomId));
    }
    return rooms;
  }

  // 다른 탭이 아직 들어가 있지 않은 방만 기록을 끝낸다.
  async function endRoomLogs(roomIds) {
    const stillEntered = await enteredRooms({ exceptSelf: true });
    const toEnd = roomIds.filter((roomId) => !stillEntered.has(roomId));
    const session = await studyModel.findActiveSession(userId);
    if (session && toEnd.length > 0) await studyModel.endLogs(session.id, toEnd);
  }

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

    const session = await studyModel.findActiveSession(userId);
    if (session) await studyModel.startLogs(session.id, [roomId]);
  });

  withAck(socket, "room:leave", async ({ roomId }) => {
    check(Number.isInteger(roomId), "roomId를 확인해 주세요.");
    socket.leave(`room:${roomId}`);
    socket.data.rooms.delete(roomId);
    await endRoomLogs([roomId]);
  });

  withAck(socket, "study:start", async ({ subjectId }) => {
    check(Number.isInteger(subjectId), "과목을 선택해 주세요.");
    const roomIds = [...(await enteredRooms())];
    const session = await studyService.startSession(io, userId, subjectId, roomIds);
    return { session };
  });

  withAck(socket, "study:stop", async () => {
    const session = await requireSession();
    await studyService.endSession(io, session.id, { status: "종료", reason: "stopped" });
  });

  withAck(socket, "study:heartbeat", async () => {
    const session = await studyModel.findActiveSession(userId);
    if (session) await studyModel.touchHeartbeat(session.id, [...socket.data.rooms]);
    return { studying: session !== null };
  });

  withAck(socket, "study:confirm", async () => {
    const session = await requireSession();
    await studyModel.confirmCheck(session.id);
  });

  // 새로고침으로 잠깐 끊겨도 공부는 이어지도록 세션은 두고, 방 기록만 정리한다.
  // (완전히 닫았다면 heartbeat가 끊겨 자동 종료 작업이 세션을 끝낸다.)
  socket.on("disconnect", () => {
    endRoomLogs([...socket.data.rooms]).catch((err) => console.error("[socket] disconnect", err));
  });
};
