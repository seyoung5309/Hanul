const classModel = require("../models/classModel");
const HttpError = require("../utils/httpError");
const { currentSchoolYear } = require("../utils/date");

// CL-001: 올해 내 반과 반 메인 roomId. 학생 목록·공부 현황은 GET /api/rooms/:roomId
async function getMyClass(req, res) {
  const myClass = await classModel.findUserClass(req.user.id, currentSchoolYear());
  if (!myClass) throw new HttpError(404, "올해 학년도에 등록된 반이 없습니다.");
  res.json(myClass);
}

module.exports = { getMyClass };
