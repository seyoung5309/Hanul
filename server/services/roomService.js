const roomModel = require("../models/roomModel");
const studyModel = require("../models/studyModel");
const HttpError = require("../utils/httpError");

const MAX_JOINED_ROOMS = 5; // 1인당 참여 가능한 공부방 수 (반 메인 제외, SR-002)

// 인원·참여 방 수를 확인하고 참가시킨다. room은 FOR UPDATE로 잠근 상태여야 한다.
async function addMemberChecked(conn, room, userId) {
  if (await roomModel.isMember(userId, room.id, conn)) throw new HttpError(409, "이미 참여한 방입니다.");
  if ((await roomModel.countMembers(conn, room.id)) >= room.maxMembers) {
    throw new HttpError(409, "방 인원이 가득 찼습니다.");
  }
  if ((await roomModel.countJoinedCustomRooms(conn, userId)) >= MAX_JOINED_ROOMS) {
    throw new HttpError(409, `공부방은 최대 ${MAX_JOINED_ROOMS}개까지 참여할 수 있습니다.`);
  }
  await roomModel.addMember(conn, userId, room.id);
}

// 참가자 목록·방장이 바뀌었음을 방 화면에 알린다. (클라이언트는 방 정보를 다시 불러온다)
function emitRoomUpdated(io, roomId, change) {
  io.to(`room:${roomId}`).emit("room:updated", { roomId, change });
}

// 나가기·내보내기 후: 그 사용자의 소켓을 방 채널에서 빼고, 이 방의 공부 기록을 끝낸다.
async function detachUser(io, userId, roomId) {
  const sockets = await io.in(`user:${userId}`).fetchSockets();
  for (const socket of sockets) {
    socket.leave(`room:${roomId}`);
    socket.data.rooms?.delete(roomId);
  }
  const session = await studyModel.findActiveSession(userId);
  if (session) await studyModel.endLogs(session.id, [roomId]);
}

// 방 폭파 (SR-005, SR-010). 참가자들의 화면에 알리고 삭제한다.
async function closeRoom(io, roomId, reason) {
  const memberIds = await roomModel.findMemberIds(roomId);
  const sockets = await io.in(`room:${roomId}`).fetchSockets();
  for (const socket of sockets) {
    socket.leave(`room:${roomId}`);
    socket.data.rooms?.delete(roomId);
  }
  await roomModel.deleteRoom(roomId);
  for (const userId of memberIds) io.to(`user:${userId}`).emit("room:removed", { roomId, reason });
}

module.exports = { MAX_JOINED_ROOMS, addMemberChecked, emitRoomUpdated, detachUser, closeRoom };
