const studyModel = require("../models/studyModel");
const roomModel = require("../models/roomModel");
const HttpError = require("../utils/httpError");

// 자동 종료 관련
const CHECK_INTERVAL_SECONDS = 3 * 60 * 60; // 3시간마다 응답 확인
const CHECK_RESPONSE_SECONDS = 30; // 확인 창이 뜬 뒤 응답 대기 시간
const HEARTBEAT_TIMEOUT_SECONDS = 2 * 60; // 창이 닫혀 heartbeat가 이만큼 끊기면 종료

// 공개 범위
function isVisibleIn(visibility, roomType) {
  return (
    visibility === "all" ||
    (visibility === "class" && roomType === "class") ||
    (visibility === "room" && roomType === "custom")
  );
}

// io한테 참여 중인 방들 상태 알리기. session이 null이면 공부 종료.
async function broadcastStatus(io, userId, session) {
  let [rooms, visibility] = await Promise.all([
    roomModel.findUserRooms(userId),
    studyModel.findVisibility(userId),
  ]);

  for (let room of rooms) {
    if (!isVisibleIn(visibility.status, room.type)) {
      continue;
    }
    io.to(`room:${room.id}`).emit("study:status", {
      roomId: room.id,
      userId,
      studying: session != null,
      subjectId: session?.subjectId ?? null,
      startedAt:
        session && isVisibleIn(visibility.time, room.type)
          ? session.start
          : null,
    });
  }
}

// 다른 탭이나 기기도 상태 통일
function emitSession(io, userId, session, reason = null) {
  io.to(`user:${userId}`).emit("study:session", { session, reason });
}

async function startSession(io, userId, subjectId, roomIds) {
  try {
    let sessionId = await studyModel.createSession(userId, subjectId);
    await studyModel.startLogs(sessionId, roomIds);
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY") {
      throw new HttpError(409, "이미 공부 중입니다.");
    }

    if (err.code === "ER_NO_REFERENCED_ROW_2") {
      throw new HttpError(400, "존재하지 않는 과목입니다.");
    }

    throw err;
  }

  let session = await studyModel.findActiveSession(userId);
  emitSession(io, userId, session);
  await broadcastStatus(io, userId, session);
  return session;
}

// reason: stopped(종료 버튼), disconnected(연결 끊김), no-response(3시간 확인 무응답)
async function endSession(io, sessionId, { status, endAt = null, reason }) {
  let ended = await studyModel.endSession(sessionId, { status, endAt });

  if (!ended) {
    return null;
  }

  emitSession(io, ended.userId, null, reason);
  await broadcastStatus(io, ended.userId, null);
  return ended;
}

module.exports = {
  CHECK_INTERVAL_SECONDS,
  CHECK_RESPONSE_SECONDS,
  HEARTBEAT_TIMEOUT_SECONDS,
  isVisibleIn,
  startSession,
  endSession,
};
