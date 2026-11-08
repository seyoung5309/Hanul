const scheduleModel = require("../models/scheduleModel");
const subjectModel = require("../models/subjectModel");
const withTransaction = require("../utils/transaction");
const HttpError = require("../utils/httpError");
const { check, toDateTime, isDate } = require("../utils/validate");
const { parseId, parseTitle, parseDescript, parseSubjectIds } = require("../utils/itemInput");

const DATE_MESSAGE = "날짜는 2026-10-01 또는 2026-10-01T14:30 형식으로 입력해 주세요.";

async function withSubjects(rows) {
  const subjects = await subjectModel.findLinked("schedule", rows.map((row) => row.id));
  return rows.map((row) => ({ ...row, subjects: subjects[row.id] }));
}

async function findOwned(userId, id) {
  const schedule = await scheduleModel.findOne(userId, id);
  if (!schedule) throw new HttpError(404, "일정을 찾을 수 없습니다.");
  return (await withSubjects([schedule]))[0];
}

// 과목이 없는 id면 FK 에러 → 400
function toSubjectError(err) {
  if (err.code === "ER_NO_REFERENCED_ROW_2") return new HttpError(400, "존재하지 않는 과목입니다.");
  return err;
}

// TD-001: { title, descript?, date, subjectIds? }
async function createSchedule(req, res) {
  const title = parseTitle(req.body.title);
  const descript = parseDescript(req.body.descript);
  const date = toDateTime(req.body.date);
  check(date, DATE_MESSAGE);
  const subjectIds = parseSubjectIds(req.body.subjectIds);

  const id = await withTransaction(async (conn) => {
    const scheduleId = await scheduleModel.create(conn, { userId: req.user.id, title, descript, date });
    await subjectModel.replaceLinked(conn, "schedule", scheduleId, subjectIds);
    return scheduleId;
  }).catch((err) => {
    throw toSubjectError(err);
  });

  res.status(201).json(await findOwned(req.user.id, id));
}

// TD-003: ?from=YYYY-MM-DD&to=YYYY-MM-DD (to 포함) &limit=
// 달력은 그 달 1일~말일, '다가오는 일정'은 from=오늘
async function getSchedules(req, res) {
  const { from, to, limit } = req.query;
  check(from === undefined || isDate(from), "from은 YYYY-MM-DD 형식입니다.");
  check(to === undefined || isDate(to), "to는 YYYY-MM-DD 형식입니다.");
  const max = limit === undefined ? null : Number(limit);
  check(max === null || (Number.isInteger(max) && max >= 1 && max <= 100), "limit는 1~100입니다.");

  // to 날짜 하루 전체를 포함하도록 다음 날 0시 전까지
  const toExclusive = to ? new Date(`${to}T00:00:00Z`) : null;
  toExclusive?.setUTCDate(toExclusive.getUTCDate() + 1);

  const rows = await scheduleModel.findRange(req.user.id, {
    from: from ? `${from} 00:00:00` : null,
    to: toExclusive ? `${toExclusive.toISOString().slice(0, 10)} 00:00:00` : null,
    limit: max,
  });
  res.json(await withSubjects(rows));
}

async function getSchedule(req, res) {
  res.json(await findOwned(req.user.id, parseId(req.params.scheduleId, "scheduleId")));
}

// TD-002: 보낸 값만 바꾼다.
async function updateSchedule(req, res) {
  const id = parseId(req.params.scheduleId, "scheduleId");
  await findOwned(req.user.id, id);

  const fields = {};
  if (req.body.title !== undefined) fields.title = parseTitle(req.body.title);
  if (req.body.descript !== undefined) fields.descript = parseDescript(req.body.descript);
  if (req.body.date !== undefined) {
    fields.date = toDateTime(req.body.date);
    check(fields.date, DATE_MESSAGE);
  }
  const subjectIds = req.body.subjectIds === undefined ? null : parseSubjectIds(req.body.subjectIds);

  await withTransaction(async (conn) => {
    await scheduleModel.update(conn, req.user.id, id, fields);
    if (subjectIds) await subjectModel.replaceLinked(conn, "schedule", id, subjectIds);
  }).catch((err) => {
    throw toSubjectError(err);
  });

  res.json(await findOwned(req.user.id, id));
}

// TD-002
async function deleteSchedule(req, res) {
  const id = parseId(req.params.scheduleId, "scheduleId");
  if ((await scheduleModel.remove(req.user.id, id)) === 0) throw new HttpError(404, "일정을 찾을 수 없습니다.");
  res.status(204).end();
}

module.exports = { createSchedule, getSchedules, getSchedule, updateSchedule, deleteSchedule, toSubjectError };
