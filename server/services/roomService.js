const roomModel = require("../models/roomModel");
const studyModel = require("../models/studyModel");
const studyService = require("./studyService");
const HttpError = require("../utils/httpError");

const MAX_JOINED_ROOMS = 5; // 1인당 참여 가능한 공부방 수

// 뱡 참가 시, 유효성? 체크
async function addMemberChecked(conn, room, userId) {
  if (await roomModel.isMember(userId, room.id, conn)) {
    throw new HttpError(409, "이미 참여한 방입니다.");
  }

  if ((await roomModel.countMembers(conn, room.id)) >= room.maxMembers) {
    throw new HttpError(409, "방 인원이 가득 찼습니다.");
  }

  if (
    (await roomModel.countJoinedCustomRooms(conn, userId)) >= MAX_JOINED_ROOMS
  ) {
    throw new HttpError(
      409,
      `공부방은 최대 ${MAX_JOINED_ROOMS}개까지 참여할 수 있습니다.`,
    );
  }

  await roomModel.addMember(conn, userId, room.id);
}

// 방 정보가 수정됐을 경우
function emitRoomUpdated(io, roomId, change) {
  io.to(`room:${roomId}`).emit("room:updated", { roomId, change });
}

// 공부 끝
async function endSessionInRoom(io, userId, roomId, reason) {
  let session = await studyModel.findActiveSession(userId);

  if (session?.roomId === roomId) {
    await studyService.endSession(io, session.id, { status: "종료", reason });
  }
}

// 나가거나 내보내기 후 처리
async function detachUser(io, userId, roomId) {
  let sockets = await io.in(`user:${userId}`).fetchSockets();

  for (let socket of sockets) {
    socket.leave(`room:${roomId}`);
    socket.data.rooms?.delete(roomId);
  }

  await endSessionInRoom(io, userId, roomId, "room-left");
}

// 방 펑 처리
async function closeRoom(io, roomId, reason) {
  let memberIds = await roomModel.findMemberIds(roomId);
  let sockets = await io.in(`room:${roomId}`).fetchSockets();

  for (let socket of sockets) {
    socket.leave(`room:${roomId}`);
    socket.data.rooms?.delete(roomId);
  }

  for (let userId of memberIds) {
    await endSessionInRoom(io, userId, roomId, "room-closed");
  }

  await roomModel.deleteRoom(roomId);

  for (let userId of memberIds) {
    io.to(`user:${userId}`).emit("room:removed", { roomId, reason });
  }
}

module.exports = {
  MAX_JOINED_ROOMS,
  addMemberChecked,
  emitRoomUpdated,
  detachUser,
  closeRoom,
};
