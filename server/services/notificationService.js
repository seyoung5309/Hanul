const notificationModel = require("../models/notificationModel");

// 알림을 저장하고 접속 중인 사용자에게 바로 보낸다.
// payload: { title, descript, type: notice|schedule|study_room, targetType?, targetId? }
async function notify(io, userIds, payload) {
  const { id, userIds: receivers } = await notificationModel.create(payload, userIds);
  for (const userId of receivers) {
    io.to(`user:${userId}`).emit("notification:new", { id, ...payload });
  }
}

module.exports = { notify };
