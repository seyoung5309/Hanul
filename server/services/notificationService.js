const notificationModel = require("../models/notificationModel");

// 알림 보내기
// payload: { title, descript, type: notice|schedule|study_room, targetType?, targetId? }
// userIds가 null이면 전체 사용자 (공지)
async function notify(io, userIds, payload) {
  let { id, userIds: receivers } = await notificationModel.create(
    payload,
    userIds,
  );

  if (!id) {
    return { id: null, count: 0 };
  }

  let message = {
    id,
    title: payload.title,
    descript: payload.descript,
    type: payload.type,
    targetType: payload.targetType ?? null,
    targetId: payload.targetId ?? null,
    createdAt: new Date(),
    isRead: false,
  };

  for (const userId of receivers) {
    io.to(`user:${userId}`).emit("notification:new", message);
  }

  return { id, count: receivers.length };
}

module.exports = { notify };
