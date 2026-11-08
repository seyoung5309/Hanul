const notificationModel = require("../models/notificationModel");

// 알림을 저장하고 접속 중인 사용자에게 바로 보낸다.
// payload: { title, descript, type: notice|schedule|study_room, targetType?, targetId? }
// userIds가 null이면 전체 사용자 (공지). 해당 알림을 꺼 둔 사용자는 받지 않는다. (NT-004)
async function notify(io, userIds, payload) {
  const { id, userIds: receivers } = await notificationModel.create(payload, userIds);
  if (!id) return { id: null, count: 0 };

  const message = {
    id,
    title: payload.title,
    descript: payload.descript,
    type: payload.type,
    targetType: payload.targetType ?? null,
    targetId: payload.targetId ?? null,
    createdAt: new Date(),
    isRead: false,
  };
  for (const userId of receivers) io.to(`user:${userId}`).emit("notification:new", message);
  return { id, count: receivers.length };
}

module.exports = { notify };
