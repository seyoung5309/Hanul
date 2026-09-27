const studyModel = require("../models/studyModel");

// 새로고침 후 공부 중인지 복구 (checkDeadline이 있으면 응답 확인 창을 다시 띄운다)
async function getCurrent(req, res) {
  res.json({ session: await studyModel.findActiveSession(req.user.id) });
}

module.exports = { getCurrent };
