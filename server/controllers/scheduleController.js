const scheduleModel = require("../models/scheduleModel");
const subjectModel = require("../models/subjectModel");
const withTransaction = require("../utils/transaction");
const HttpError = require("../utils/httpError");
const { check, toDateTime, isDate } = require("../utils/validate");
const {
  parseId,
  parseTitle,
  parseDescript,
  parseSubjectIds,
} = require("../utils/itemInput");

const DATE_MESSAGE =
  "날짜는 2026-10-01 또는 2026-10-01T14:30 형식으로 입력해 주세요.";

// 일정에 관련된 과목 불러오기
async function withSubjects(rows) {
  let subjects = await subjectModel.findLinked(
    "schedule",
    rows.map((row) => row.id),
  );

  return rows.map((row) => ({ ...row, subjects: subjects[row.id] }));
}

// 일정 찾기
async function findOwned(userId, id) {
  let schedule = await scheduleModel.findOne(userId, id);

  if (!schedule) {
    throw new HttpError(404, "일정을 찾을 수 없습니다.");
  }

  return (await withSubjects([schedule]))[0];
}

// 과목이 없는 id면 FK 에러
function toSubjectError(err) {
  if (err.code == "ER_NO_REFERENCED_ROW_2") {
    return new HttpError(400, "존재하지 않는 과목입니다.");
  }

  return err;
}

// 일정 생성 { title, descript?, date, subjectIds? }
async function createSchedule(req, res) {
  let title = parseTitle(req.body.title);
  let descript = parseDescript(req.body.descript);
  let date = toDateTime(req.body.date);
  check(date, DATE_MESSAGE);
  let subjectIds = parseSubjectIds(req.body.subjectIds);

  let id = await withTransaction(async (conn) => {
    let scheduleId = await scheduleModel.create(conn, {
      userId: req.user.id,
      title,
      descript,
      date,
    });
    await subjectModel.replaceLinked(conn, "schedule", scheduleId, subjectIds);
    return scheduleId;
  }).catch((err) => {
    throw toSubjectError(err);
  });

  res.status(201).json(await findOwned(req.user.id, id));
}

// 일정 목록 불러오기
async function getSchedules(req, res) {
  let { from, to, limit } = req.query;
  check(from == undefined || isDate(from), "from은 YYYY-MM-DD 형식입니다.");
  check(to == undefined || isDate(to), "to는 YYYY-MM-DD 형식입니다.");
  let max = limit == undefined ? null : Number(limit);
  check(
    max === null || (Number.isInteger(max) && max >= 1 && max <= 100),
    "limit는 1~100입니다.",
  );

  // to 날짜 하루 전체를 포함하도록 다음 날 0시 전까지
  let toExclusive = to ? new Date(`${to}T00:00:00Z`) : null;
  toExclusive?.setUTCDate(toExclusive.getUTCDate() + 1);

  let rows = await scheduleModel.findRange(req.user.id, {
    from: from ? `${from} 00:00:00` : null,
    to: toExclusive
      ? `${toExclusive.toISOString().slice(0, 10)} 00:00:00`
      : null,
    limit: max,
  });
  res.json(await withSubjects(rows));
}

// 일정 하나 불러오기
async function getSchedule(req, res) {
  res.json(
    await findOwned(req.user.id, parseId(req.params.scheduleId, "scheduleId")),
  );
}

// 일정 수정
async function updateSchedule(req, res) {
  let id = parseId(req.params.scheduleId, "scheduleId");
  await findOwned(req.user.id, id);

  let fields = {};
  if (req.body.title !== undefined) {
    fields.title = parseTitle(req.body.title);
  }

  if (req.body.descript != undefined) {
    fields.descript = parseDescript(req.body.descript);
  }

  if (req.body.date != undefined) {
    fields.date = toDateTime(req.body.date);
    check(fields.date, DATE_MESSAGE);
  }

  let subjectIds =
    req.body.subjectIds == undefined
      ? null
      : parseSubjectIds(req.body.subjectIds);

  await withTransaction(async (conn) => {
    await scheduleModel.update(conn, req.user.id, id, fields);
    if (subjectIds) {
      await subjectModel.replaceLinked(conn, "schedule", id, subjectIds);
    }
  }).catch((err) => {
    throw toSubjectError(err);
  });

  res.json(await findOwned(req.user.id, id));
}

// 일정 삭제
async function deleteSchedule(req, res) {
  let id = parseId(req.params.scheduleId, "scheduleId");

  if ((await scheduleModel.remove(req.user.id, id)) == 0) {
    throw new HttpError(404, "일정을 찾을 수 없습니다.");
  }

  res.status(204).end();
}

module.exports = {
  createSchedule,
  getSchedules,
  getSchedule,
  updateSchedule,
  deleteSchedule,
  toSubjectError,
};
