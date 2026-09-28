const todoModel = require("../models/todoModel");
const subjectModel = require("../models/subjectModel");
const withTransaction = require("../utils/transaction");
const HttpError = require("../utils/httpError");
const { check, toDateTime, isBoolean } = require("../utils/validate");
const { parseId, parseTitle, parseDescript, parseSubjectIds } = require("../utils/itemInput");
const { toSubjectError } = require("./scheduleController");

const DUE_MESSAGE = "마감일은 2026-10-01 또는 2026-10-01T14:30 형식으로 입력해 주세요.";

async function withSubjects(rows) {
  const subjects = await subjectModel.findLinked("todo", rows.map((row) => row.id));
  return rows.map((row) => ({ ...row, subjects: subjects[row.id] }));
}

async function findOwned(userId, id) {
  const todo = await todoModel.findOne(userId, id);
  if (!todo) throw new HttpError(404, "할 일을 찾을 수 없습니다.");
  return (await withSubjects([todo]))[0];
}

// 마감일은 선택. null이나 빈 값이면 마감 없음
function parseDueDate(value) {
  if (value === null || value === undefined || value === "") return null;
  const dueDate = toDateTime(value);
  check(dueDate, DUE_MESSAGE);
  return dueDate;
}

// TD-004: { title, descript?, dueDate?, subjectIds? }
async function createTodo(req, res) {
  const title = parseTitle(req.body.title);
  const descript = parseDescript(req.body.descript);
  const dueDate = parseDueDate(req.body.dueDate);
  const subjectIds = parseSubjectIds(req.body.subjectIds);

  const id = await withTransaction(async (conn) => {
    const todoId = await todoModel.create(conn, { userId: req.user.id, title, descript, dueDate });
    await subjectModel.replaceLinked(conn, "todo", todoId, subjectIds);
    return todoId;
  }).catch((err) => {
    throw toSubjectError(err);
  });

  res.status(201).json(await findOwned(req.user.id, id));
}

// ?done=true|false (없으면 전체). 안 한 것 → 마감 가까운 순
async function getTodos(req, res) {
  const { done } = req.query;
  check(done === undefined || done === "true" || done === "false", "done은 true 또는 false입니다.");
  const rows = await todoModel.findAll(req.user.id, { done: done === undefined ? null : done === "true" });
  res.json(await withSubjects(rows));
}

// TD-005: 보낸 값만 바꾼다.
async function updateTodo(req, res) {
  const id = parseId(req.params.todoId, "todoId");
  await findOwned(req.user.id, id);

  const fields = {};
  if (req.body.title !== undefined) fields.title = parseTitle(req.body.title);
  if (req.body.descript !== undefined) fields.descript = parseDescript(req.body.descript);
  if (req.body.dueDate !== undefined) fields.due_date = parseDueDate(req.body.dueDate);
  const subjectIds = req.body.subjectIds === undefined ? null : parseSubjectIds(req.body.subjectIds);

  await withTransaction(async (conn) => {
    await todoModel.update(conn, req.user.id, id, fields);
    if (subjectIds) await subjectModel.replaceLinked(conn, "todo", id, subjectIds);
  }).catch((err) => {
    throw toSubjectError(err);
  });

  res.json(await findOwned(req.user.id, id));
}

// TD-006: { isDone }
async function setDone(req, res) {
  const id = parseId(req.params.todoId, "todoId");
  check(isBoolean(req.body.isDone), "isDone은 true 또는 false여야 합니다.");
  if ((await todoModel.setDone(req.user.id, id, req.body.isDone)) === 0) {
    throw new HttpError(404, "할 일을 찾을 수 없습니다.");
  }
  res.json(await findOwned(req.user.id, id));
}

// '전체 완료 처리하기'
async function setAllDone(req, res) {
  res.json({ updated: await todoModel.setAllDone(req.user.id) });
}

// TD-005
async function deleteTodo(req, res) {
  const id = parseId(req.params.todoId, "todoId");
  if ((await todoModel.remove(req.user.id, id)) === 0) throw new HttpError(404, "할 일을 찾을 수 없습니다.");
  res.status(204).end();
}

module.exports = { createTodo, getTodos, updateTodo, setDone, setAllDone, deleteTodo };
