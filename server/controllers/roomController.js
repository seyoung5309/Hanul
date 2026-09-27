const crypto = require("crypto");
const roomModel = require("../models/roomModel");
const chatModel = require("../models/chatModel");
const userModel = require("../models/userModel");
const roomService = require("../services/roomService");
const notificationService = require("../services/notificationService");
const { isVisibleIn } = require("../services/studyService");
const withTransaction = require("../utils/transaction");
const HttpError = require("../utils/httpError");
const { check, isIntBetween, isBoolean } = require("../utils/validate");
const { getIO } = require("../socket");

const MAX_TITLE_LENGTH = 30;
const MAX_KEYWORDS = 3; // SR-001
const MEMBERS_RANGE = [2, 30];
const CODE_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

// 영문 대문자 + 숫자 6자리 (SR-001)
function generateRoomCode() {
  return Array.from({ length: 6 }, () => CODE_CHARS[crypto.randomInt(CODE_CHARS.length)]).join("");
}

function parseId(value, name) {
  const id = Number(value);
  check(Number.isInteger(id) && id > 0, `${name}를 확인해 주세요.`);
  return id;
}

// 참가자만 방을 볼 수 있다. 참가하지 않은 방은 있는지도 알려주지 않는다. (NF-005)
async function loadMemberRoom(req) {
  const roomId = parseId(req.params.roomId, "roomId");
  const room = await roomModel.findById(roomId);
  if (!room || !(await roomModel.isMember(req.user.id, roomId))) {
    throw new HttpError(404, "공부방을 찾을 수 없습니다.");
  }
  return room;
}

async function loadOwnedRoom(req) {
  const room = await loadMemberRoom(req);
  if (room.ownerId !== req.user.id) throw new HttpError(403, "방장만 할 수 있습니다.");
  return room;
}

// 방장이 다른 참가자를 대상으로 하는 기능(위임·내보내기)의 대상 확인
async function loadTargetMember(req, room) {
  const targetId = parseId(req.params.userId ?? req.body.userId, "userId");
  check(targetId !== req.user.id, "자기 자신은 선택할 수 없습니다.");
  if (!(await roomModel.isMember(targetId, room.id))) throw new HttpError(404, "방 참가자가 아닙니다.");
  return targetId;
}

// SR-001
async function createRoom(req, res) {
  const { title, comment = null, subjectIds = [], maxMembers } = req.body;
  check(typeof title === "string" && title.trim().length >= 1 && title.trim().length <= MAX_TITLE_LENGTH,
    `제목은 1~${MAX_TITLE_LENGTH}자로 입력해 주세요.`);
  check(comment === null || (typeof comment === "string" && comment.length <= 255), "설명은 255자 이하로 입력해 주세요.");
  check(Array.isArray(subjectIds) && subjectIds.every(Number.isInteger), "키워드 값을 확인해 주세요.");
  check(new Set(subjectIds).size === subjectIds.length, "키워드가 중복되었습니다.");
  check(subjectIds.length <= MAX_KEYWORDS, `키워드는 최대 ${MAX_KEYWORDS}개까지 선택할 수 있습니다.`);
  check(isIntBetween(maxMembers, ...MEMBERS_RANGE), `최대 인원은 ${MEMBERS_RANGE[0]}~${MEMBERS_RANGE[1]}명으로 설정해 주세요.`);

  const room = await withTransaction(async (conn) => {
    if ((await roomModel.countJoinedCustomRooms(conn, req.user.id)) >= roomService.MAX_JOINED_ROOMS) {
      throw new HttpError(409, `공부방은 최대 ${roomService.MAX_JOINED_ROOMS}개까지 참여할 수 있습니다.`);
    }

    // 방 코드가 겹치면 새로 뽑는다.
    for (let attempt = 0; attempt < 5; attempt++) {
      const roomCode = generateRoomCode();
      try {
        const roomId = await roomModel.createRoom(conn, {
          title: title.trim(),
          comment: comment?.trim() || null,
          roomCode,
          ownerId: req.user.id,
          maxMembers,
        });
        await roomModel.setSubjects(conn, roomId, subjectIds);
        await roomModel.addMember(conn, req.user.id, roomId);
        return { id: roomId, roomCode };
      } catch (err) {
        if (err.code === "ER_DUP_ENTRY" && err.sqlMessage.includes("room_code")) continue;
        throw err;
      }
    }
    throw new Error("방 코드 생성에 실패했습니다.");
  });

  res.status(201).json(room);
}

async function getMyRooms(req, res) {
  const rooms = await roomModel.findMyRooms(req.user.id);
  const roomIds = rooms.map((room) => room.id);
  const [subjects, times, unread] = await Promise.all([
    roomModel.findSubjectsByRooms(roomIds),
    roomModel.findRoomTimes(roomIds, req.user.id),
    chatModel.countUnread(req.user.id),
  ]);
  res.json(rooms.map((room) => ({
    ...room,
    ...times[room.id],
    unreadCount: unread[room.id] ?? 0, // CL-003, SR-011
    subjects: subjects[room.id],
  })));
}

// SR-002
async function joinByCode(req, res) {
  const roomCode = typeof req.body.roomCode === "string" ? req.body.roomCode.trim().toUpperCase() : "";
  check(/^[A-Z0-9]{6}$/.test(roomCode), "방 코드는 영문과 숫자 6자리입니다.");

  const roomId = await withTransaction(async (conn) => {
    const room = await roomModel.findByCode(conn, roomCode);
    if (!room) throw new HttpError(404, "방 코드를 확인해 주세요.");
    await roomService.addMemberChecked(conn, room, req.user.id);
    return room.id;
  });

  roomService.emitRoomUpdated(getIO(), roomId, "joined");
  res.status(201).json({ roomId });
}

// SR-003, CL-001: 방 정보와 참가자 공부 현황 (반 메인도 같은 API)
async function getRoom(req, res) {
  const room = await loadMemberRoom(req);
  const [members, subjects, times] = await Promise.all([
    roomModel.findMembers(room.id),
    roomModel.findSubjectsByRooms([room.id]),
    roomModel.findRoomTimes([room.id], req.user.id),
  ]);

  res.json({
    ...room,
    ...times[room.id],
    subjects: subjects[room.id],
    members: members.map((m) => {
      const isMe = m.userId === req.user.id;
      const showStatus = isMe || isVisibleIn(m.statusVisibility, room.type); // UD-008
      const showTime = isMe || isVisibleIn(m.timeVisibility, room.type);
      return {
        userId: m.userId,
        identifier: m.identifier,
        name: m.name,
        img: m.img,
        number: m.number, // 반 메인에서만 값이 있음
        isOwner: m.userId === room.ownerId,
        joinedAt: m.joinedAt,
        studying: showStatus ? Boolean(m.studying) : null,
        subjectId: showStatus ? m.subjectId : null,
        startedAt: showStatus && showTime ? m.startedAt : null,
        todaySeconds: showTime ? Number(m.todaySeconds) : null,
      };
    }),
  });
}

// SR-005
async function deleteRoom(req, res) {
  const room = await loadOwnedRoom(req);
  await roomService.closeRoom(getIO(), room.id, "deleted");
  res.status(204).end();
}

// SR-006
async function changeOwner(req, res) {
  const room = await loadOwnedRoom(req);
  const targetId = await loadTargetMember(req, room);
  await roomModel.setOwner(room.id, targetId);
  roomService.emitRoomUpdated(getIO(), room.id, "owner");
  res.status(204).end();
}

// SR-007
async function leaveRoom(req, res) {
  const room = await loadMemberRoom(req);
  check(room.type === "custom", "반 메인에서는 나갈 수 없습니다.");
  if (room.ownerId === req.user.id) {
    throw new HttpError(409, "방장은 방장을 넘기거나 방을 삭제한 뒤 나갈 수 있습니다.");
  }

  await roomModel.removeMember(req.user.id, room.id);
  const io = getIO();
  await roomService.detachUser(io, req.user.id, room.id);
  roomService.emitRoomUpdated(io, room.id, "left");
  res.status(204).end();
}

// SR-009
async function kickMember(req, res) {
  const room = await loadOwnedRoom(req);
  const targetId = await loadTargetMember(req, room);

  await roomModel.removeMember(targetId, room.id);
  const io = getIO();
  await roomService.detachUser(io, targetId, room.id);
  io.to(`user:${targetId}`).emit("room:removed", { roomId: room.id, reason: "kicked" });
  roomService.emitRoomUpdated(io, room.id, "kicked");
  res.status(204).end();
}

// SR-008: 아이디 검색(GET /api/users/search)이나 같은 반 목록에서 고른 사용자를 초대
async function inviteUser(req, res) {
  const room = await loadOwnedRoom(req);
  const inviteeId = parseId(req.body.userId, "userId");
  check(inviteeId !== req.user.id, "자기 자신은 초대할 수 없습니다.");
  if (await roomModel.isMember(inviteeId, room.id)) throw new HttpError(409, "이미 참여한 사용자입니다.");

  let inviteId;
  try {
    inviteId = await roomModel.createInvite({ roomId: room.id, inviterId: req.user.id, inviteeId });
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY") throw new HttpError(409, "이미 초대한 사용자입니다.");
    if (err.code === "ER_NO_REFERENCED_ROW_2") throw new HttpError(404, "존재하지 않는 사용자입니다.");
    throw err;
  }

  const inviter = await userModel.findProfile(req.user.id);
  await notificationService.notify(getIO(), [inviteeId], {
    title: "공부방 초대",
    descript: `${inviter.name}님이 '${room.title}' 공부방에 초대했습니다.`,
    type: "study_room",
    targetType: "room_invite",
    targetId: inviteId,
  });
  res.status(201).json({ id: inviteId });
}

async function getMyInvites(req, res) {
  res.json(await roomModel.findPendingInvites(req.user.id));
}

// SR-008: 초대받은 사람이 수락·거절
async function answerInvite(req, res) {
  const inviteId = parseId(req.params.inviteId, "inviteId");
  const { accept } = req.body;
  check(isBoolean(accept), "accept는 true 또는 false여야 합니다.");

  const roomId = await withTransaction(async (conn) => {
    const invite = await roomModel.findInviteForUpdate(conn, inviteId);
    if (!invite || invite.inviteeId !== req.user.id || invite.status !== "대기") {
      throw new HttpError(404, "초대를 찾을 수 없습니다.");
    }

    if (accept) {
      const room = await roomModel.findById(invite.roomId, { conn, forUpdate: true });
      await roomService.addMemberChecked(conn, room, req.user.id);
    }
    await roomModel.answerInvite(conn, invite.id, accept ? "수락" : "거절");
    return invite.roomId;
  });

  if (accept) roomService.emitRoomUpdated(getIO(), roomId, "joined");
  res.json({ roomId, accepted: accept });
}

module.exports = {
  createRoom,
  getMyRooms,
  joinByCode,
  getRoom,
  deleteRoom,
  changeOwner,
  leaveRoom,
  kickMember,
  inviteUser,
  getMyInvites,
  answerInvite,
  // chatController에서 같은 방 접근 확인을 쓴다.
  parseId,
  loadMemberRoom,
};
