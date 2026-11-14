const classModel = require("../models/classModel");
const HttpError = require("../utils/httpError");
const { currentSchoolYear } = require("../utils/date");

// 올해 내 반과 반 메인 roomId 불러오기
async function getMyClass(req, res) {
  let myClass = await classModel.findUserClass(
    req.user.id,
    currentSchoolYear(),
  );

  if (!myClass) {
    throw new HttpError(404, "올해 학년도에 등록된 반이 없습니다.");
  }

  res.json(myClass);
}

module.exports = { getMyClass };
