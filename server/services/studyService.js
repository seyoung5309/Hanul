const studyModel = require("../models/studyModel");
const roomModel = require("../models/roomModel");
const HttpError = require("../utils/httpError");

// ST-003 자동 종료 기준
const CHECK_INTERVAL_SECONDS = 3 * 60 * 60; // 3시간마다 응답 확인
const CHECK_RESPONSE_SECONDS = 30; // 확인 창이 뜬 뒤 응답 대기 시간
const HEARTBEAT_TIMEOUT_SECONDS = 2 * 60; // 창이 닫혀 heartbeat가 이만큼 끊기면 종료

// 공개 범위(UD-008)가 이 방 종류에 보여줘도 되는지
function isVisibleIn(visibility, roomType) {
  return (
    visibility === "all" ||
    (visibility === "class" && roomType === "class") ||
    (visibility === "room" && roomType === "custom")
  );
}

// 참여 중인 방들에 공부 상태를 알린다. session이 null이면 공부 종료.
async function broadcastStatus(io, userId, session) {
  const [rooms, visibility] = await Promise.all([
    roomModel.findUserRooms(userId),
    studyModel.findVisibility(userId),
  ]);

  for (const room of rooms) {
    if (!isVisibleIn(visibility.status, room.type)) continue;
    io.to(`room:${room.id}`).emit("study:status", {
      roomId: room.id,
      userId,
      studying: session !== null,
      subjectId: session?.subjectId ?? null,
      startedAt: session && isVisibleIn(visibility.time, room.type) ? session.start : null,
    });
  }
}

// 내 다른 탭·기기에도 현재 세션을 맞춰 준다.
function emitSession(io, userId, session, reason = null) {
  io.to(`user:${userId}`).emit("study:session", { session, reason });
}

async function startSession(io, userId, subjectId, roomIds) {
  try {
    const sessionId = await studyModel.createSession(userId, subjectId);
    await studyModel.startLogs(sessionId, roomIds);
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY") throw new HttpError(409, "이미 공부 중입니다.");
    if (err.code === "ER_NO_REFERENCED_ROW_2") throw new HttpError(400, "존재하지 않는 과목입니다.");
    throw err;
  }

  const session = await studyModel.findActiveSession(userId);
  emitSession(io, userId, session);
  await broadcastStatus(io, userId, session);
  return session;
}

// reason: stopped(종료 버튼), disconnected(연결 끊김), no-response(3시간 확인 무응답)
async function endSession(io, sessionId, { status, endAt = null, reason }) {
  const ended = await studyModel.endSession(sessionId, { status, endAt });
  if (!ended) return null;

  emitSession(io, ended.userId, null, reason);
  await broadcastStatus(io, ended.userId, null);
  return ended;
}

module.exports = {
  CHECK_INTERVAL_SECONDS,
  CHECK_RESPONSE_SECONDS,
  HEARTBEAT_TIMEOUT_SECONDS,
  startSession,
  endSession,
};
