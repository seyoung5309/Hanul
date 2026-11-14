const crypto = require("crypto");
const roomModel = require("../models/roomModel");
const chatModel = require("../models/chatModel");
const notificationModel = require("../models/notificationModel");
const userModel = require("../models/userModel");
const roomService = require("../services/roomService");
const cloudinaryService = require("../services/cloudinaryService");
const notificationService = require("../services/notificationService");
const { isVisibleIn } = require("../services/studyService");
const withTransaction = require("../utils/transaction");
const HttpError = require("../utils/httpError");
const { check, isIntBetween, isBoolean } = require("../utils/validate");
const { getIO } = require("../socket");

const MAX_TITLE_LENGTH = 30;
const MAX_KEYWORDS = 3;
const MEMBERS_RANGE = [2, 30];
const CODE_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

// 방 코드 생성 (영문 대문자 + 숫자 6자리 )
function generateRoomCode() {
  return Array.from(
    { length: 6 },
    () => CODE_CHARS[crypto.randomInt(CODE_CHARS.length)],
  ).join("");
}

// 방 아이디 int형으로 변환
function parseId(value, name) {
  let id = Number(value);
  check(Number.isInteger(id) && id > 0, `${name}를 확인해 주세요.`);
  return id;
}

// 참가한 방 불러오기
async function loadMemberRoom(req) {
  let roomId = parseId(req.params.roomId, "roomId");
  let room = await roomModel.findById(roomId);

  if (!room || !(await roomModel.isMember(req.user.id, roomId))) {
    throw new HttpError(404, "공부방을 찾을 수 없습니다.");
  }

  return room;
}

// 내가 방장인 룸 불러오기
async function loadOwnedRoom(req) {
  let room = await loadMemberRoom(req);

  if (room.ownerId !== req.user.id) {
    throw new HttpError(403, "방장만 할 수 있습니다.");
  }

  return room;
}

// 방장이 다른 사용자 관련 기능할 때 유효성 체크
async function loadTargetMember(req, room) {
  let targetId = parseId(req.params.userId ?? req.body.userId, "userId");
  check(targetId != req.user.id, "자기 자신은 선택할 수 없습니다.");

  if (!(await roomModel.isMember(targetId, room.id))) {
    throw new HttpError(404, "방 참가자가 아닙니다.");
  }

  return targetId;
}

// 방 생성
async function createRoom(req, res) {
  let { title, comment = null, subjectIds = [], maxMembers } = req.body;

  check(
    typeof title == "string" &&
      title.trim().length >= 1 &&
      title.trim().length <= MAX_TITLE_LENGTH,
    `제목은 1~${MAX_TITLE_LENGTH}자로 입력해 주세요.`,
  );

  check(
    comment == null || (typeof comment == "string" && comment.length <= 255),
    "설명은 255자 이하로 입력해 주세요.",
  );

  check(
    Array.isArray(subjectIds) && subjectIds.every(Number.isInteger),
    "키워드 값을 확인해 주세요.",
  );

  check(
    new Set(subjectIds).size == subjectIds.length,
    "키워드가 중복되었습니다.",
  );

  check(
    subjectIds.length <= MAX_KEYWORDS,
    `키워드는 최대 ${MAX_KEYWORDS}개까지 선택할 수 있습니다.`,
  );

  check(
    isIntBetween(maxMembers, ...MEMBERS_RANGE),
    `최대 인원은 ${MEMBERS_RANGE[0]}~${MEMBERS_RANGE[1]}명으로 설정해 주세요.`,
  );

  let room = await withTransaction(async (conn) => {
    if (
      (await roomModel.countJoinedCustomRooms(conn, req.user.id)) >=
      roomService.MAX_JOINED_ROOMS
    ) {
      throw new HttpError(
        409,
        `공부방은 최대 ${roomService.MAX_JOINED_ROOMS}개까지 참여할 수 있습니다.`,
      );
    }

    // 방 코드가 겹치면 새로 뽑는다.
    for (let attempt = 0; attempt < 5; attempt++) {
      let roomCode = generateRoomCode();
      try {
        let roomId = await roomModel.createRoom(conn, {
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
        if (
          err.code === "ER_DUP_ENTRY" &&
          err.sqlMessage.includes("room_code")
        ) {
          continue;
        }

        throw err;
      }
    }
    throw new Error("방 코드 생성에 실패했습니다.");
  });

  res.status(201).json(room);
}

async function getMyRooms(req, res) {
  let rooms = await roomModel.findMyRooms(req.user.id);
  let roomIds = rooms.map((room) => room.id);
  let [subjects, times, unread] = await Promise.all([
    roomModel.findSubjectsByRooms(roomIds),
    roomModel.findRoomTimes(roomIds, req.user.id),
    chatModel.countUnread(req.user.id),
  ]);

  res.json(
    rooms.map((room) => ({
      ...room,
      ...times[room.id],
      unreadCount: unread[room.id] ?? 0,
      subjects: subjects[room.id],
    })),
  );
}

// 방 코드로 참가하기
async function joinByCode(req, res) {
  let roomCode =
    typeof req.body.roomCode == "string"
      ? req.body.roomCode.trim().toUpperCase()
      : "";

  check(/^[A-Z0-9]{6}$/.test(roomCode), "방 코드는 영문과 숫자 6자리입ㄴㅣ다.");

  let roomId = await withTransaction(async (conn) => {
    let room = await roomModel.findByCode(conn, roomCode);
    if (!room) {
      throw new HttpError(404, "방 코드를 확인해 주세요.");
    }

    await roomService.addMemberChecked(conn, room, req.user.id);
    return room.id;
  });

  roomService.emitRoomUpdated(getIO(), roomId, "joined");
  res.status(201).json({ roomId });
}

// 방 정보와 참가자 공부 현황 (반 메인도 같은 API)
async function getRoom(req, res) {
  let room = await loadMemberRoom(req);
  let [members, subjects, times] = await Promise.all([
    roomModel.findMembers(room.id),
    roomModel.findSubjectsByRooms([room.id]),
    roomModel.findRoomTimes([room.id], req.user.id),
  ]);

  res.json({
    ...room,
    ...times[room.id],
    subjects: subjects[room.id],
    members: members.map((m) => {
      let isMe = m.userId === req.user.id;
      let showStatus = isMe || isVisibleIn(m.statusVisibility, room.type); // UD-008
      let showTime = isMe || isVisibleIn(m.timeVisibility, room.type);

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

// 방 삭제하기
async function deleteRoom(req, res) {
  let room = await loadOwnedRoom(req);
  await roomService.closeRoom(getIO(), room.id, "deleted");
  res.status(204).end();
}

// 방장 변경
async function changeOwner(req, res) {
  let room = await loadOwnedRoom(req);
  let targetId = await loadTargetMember(req, room);
  await roomModel.setOwner(room.id, targetId);
  roomService.emitRoomUpdated(getIO(), room.id, "owner");
  res.status(204).end();
}

// 방 떠나기
async function leaveRoom(req, res) {
  let room = await loadMemberRoom(req);
  check(room.type === "custom", "반 메인에서는 나갈 수 없습니다.");

  if (room.ownerId === req.user.id) {
    throw new HttpError(
      409,
      "방장은 방장을 넘기거나 방을 삭제한 뒤 나갈 수 있습니다.",
    );
  }

  await roomModel.removeMember(req.user.id, room.id);
  let io = getIO();
  await roomService.detachUser(io, req.user.id, room.id);
  roomService.emitRoomUpdated(io, room.id, "left");
  res.status(204).end();
}

// 사용자 강퇴
async function kickMember(req, res) {
  let room = await loadOwnedRoom(req);
  let targetId = await loadTargetMember(req, room);

  await roomModel.removeMember(targetId, room.id);
  let io = getIO();
  await roomService.detachUser(io, targetId, room.id);

  io.to(`user:${targetId}`).emit("room:removed", {
    roomId: room.id,
    reason: "kicked",
  });

  roomService.emitRoomUpdated(io, room.id, "kicked");
  res.status(204).end();
}

// 아이디 검색(GET /api/users/search)이나 같은 반 목록에서 고른 사용자를 초대
async function inviteUser(req, res) {
  let room = await loadOwnedRoom(req);
  let inviteeId = parseId(req.body.userId, "userId");

  check(inviteeId !== req.user.id, "자기 자신은 초대할 수 없습니다.");

  if (await roomModel.isMember(inviteeId, room.id)) {
    throw new HttpError(409, "이미 참여한 사용자입니다.");
  }

  let inviteId;

  try {
    inviteId = await roomModel.createInvite({
      roomId: room.id,
      inviterId: req.user.id,
      inviteeId,
    });
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY") {
      throw new HttpError(409, "이미 초대한 사용자입니다.");
    }
    if (err.code === "ER_NO_REFERENCED_ROW_2") {
      throw new HttpError(404, "존재하지 않는 사용자입니다.");
    }
    throw err;
  }

  let inviter = await userModel.findProfile(req.user.id);

  await notificationService.notify(getIO(), [inviteeId], {
    title: "공부방 초대",
    descript: `${inviter.name}님이 '${room.title}' 공부방에 초대했습니다.`,
    type: "study_room",
    targetType: "room_invite",
    targetId: inviteId,
  });

  res.status(201).json({ id: inviteId });
}

// 쵇 불러오기 (근데 이거 디자인 없어서 구현 안됐을텐데)
async function getMyInvites(req, res) {
  res.json(await roomModel.findPendingInvites(req.user.id));
}

// 초대 수락 혹은 거절 (이것도)
async function answerInvite(req, res) {
  let inviteId = parseId(req.params.inviteId, "inviteId");
  let { accept } = req.body;

  check(isBoolean(accept), "accept는 true 또는 false여야 합니다.");

  let roomId = await withTransaction(async (conn) => {
    let invite = await roomModel.findInviteForUpdate(conn, inviteId);

    if (
      !invite ||
      invite.inviteeId !== req.user.id ||
      invite.status !== "대기"
    ) {
      throw new HttpError(404, "초대를 찾을 수 없습니다.");
    }

    if (accept) {
      let room = await roomModel.findById(invite.roomId, {
        conn,
        forUpdate: true,
      });
      await roomService.addMemberChecked(conn, room, req.user.id);
    }

    await roomModel.answerInvite(conn, invite.id, accept ? "수락" : "거절");
    return invite.roomId;
  });

  await notificationModel.markReadByTarget(
    req.user.id,
    "room_invite",
    inviteId,
  ); // 응답한 초대 알림은 읽음

  if (accept) {
    roomService.emitRoomUpdated(getIO(), roomId, "joined");
  }

  res.json({ roomId, accepted: accept });
}

// 썸네일 업로드 준비 - 브라우저가 Cloudinary에 올릴 값 (방장만, 프로필 사진과 같은 방식)
async function createImgUpload(req, res) {
  let room = await loadOwnedRoom(req);
  res.json(cloudinaryService.createRoomUpload(room.id));
}

// { url } 올린 사진을 썸네일로 저장, null이면 삭제 (방장만)
async function updateImg(req, res) {
  let room = await loadOwnedRoom(req);
  let { url } = req.body;

  check(
    url === null || cloudinaryService.isRoomImgUrl(room.id, url),
    "사진 주소를 확인해 주세요.",
  );

  await roomModel.updateImg(room.id, url);
  roomService.emitRoomUpdated(getIO(), room.id, "img");
  res.status(204).end();
}

module.exports = {
  createImgUpload,
  updateImg,
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
