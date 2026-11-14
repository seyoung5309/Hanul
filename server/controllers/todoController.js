const todoModel = require("../models/todoModel");
const subjectModel = require("../models/subjectModel");
const withTransaction = require("../utils/transaction");
const HttpError = require("../utils/httpError");
const { check, toDateTime, isBoolean } = require("../utils/validate");
const {
  parseId,
  parseTitle,
  parseDescript,
  parseSubjectIds,
} = require("../utils/itemInput");
const { toSubjectError } = require("./scheduleController");

const DUE_MESSAGE =
  "마감일은 2026-10-01 또는 2026-10-01T14:30 형식으로 입력해 주세요.";

// 무슨 과목이니?
async function withSubjects(rows) {
  let subjects = await subjectModel.findLinked(
    "todo",
    rows.map((row) => row.id),
  );

  return rows.map((row) => ({ ...row, subjects: subjects[row.id] }));
}

// 유저와 투두 매치
async function findOwned(userId, id) {
  let todo = await todoModel.findOne(userId, id);

  if (!todo) {
    throw new HttpError(404, "To Do를 찾을 수 없습니다.");
  }

  return (await withSubjects([todo]))[0];
}

// 날짜 변환
function parseDueDate(value) {
  if (value == null || value == undefined || value == "") {
    return null;
  }

  let dueDate = toDateTime(value);
  check(dueDate, DUE_MESSAGE);
  return dueDate;
}

// 투두 생서하기 { title, descript?, dueDate?, subjectIds? }
async function createTodo(req, res) {
  let title = parseTitle(req.body.title);
  let descript = parseDescript(req.body.descript);
  let dueDate = parseDueDate(req.body.dueDate);
  let subjectIds = parseSubjectIds(req.body.subjectIds);

  let id = await withTransaction(async (conn) => {
    let todoId = await todoModel.create(conn, {
      userId: req.user.id,
      title,
      descript,
      dueDate,
    });
    await subjectModel.replaceLinked(conn, "todo", todoId, subjectIds);
    return todoId;
  }).catch((err) => {
    throw toSubjectError(err);
  });

  res.status(201).json(await findOwned(req.user.id, id));
}

// 투두 목록 불러오기 자고싶다
async function getTodos(req, res) {
  let { done } = req.query;

  check(
    done == undefined || done == "true" || done == "false",
    "done은 true 또는 false입니다.",
  );

  let rows = await todoModel.findAll(req.user.id, {
    done: done == undefined ? null : done == "true",
  });

  res.json(await withSubjects(rows));
}

// 투두 수정하기
async function updateTodo(req, res) {
  let id = parseId(req.params.todoId, "todoId");
  await findOwned(req.user.id, id);

  const fields = {};

  if (req.body.title !== undefined) {
    fields.title = parseTitle(req.body.title);
  }

  if (req.body.descript != undefined) {
    fields.descript = parseDescript(req.body.descript);
  }

  if (req.body.dueDate != undefined) {
    fields.due_date = parseDueDate(req.body.dueDate);
  }

  let subjectIds =
    req.body.subjectIds == undefined
      ? null
      : parseSubjectIds(req.body.subjectIds);

  await withTransaction(async (conn) => {
    await todoModel.update(conn, req.user.id, id, fields);

    if (subjectIds) {
      await subjectModel.replaceLinked(conn, "todo", id, subjectIds);
    }
  }).catch((err) => {
    throw toSubjectError(err);
  });

  res.json(await findOwned(req.user.id, id));
}

// 투두 완료!
async function setDone(req, res) {
  let id = parseId(req.params.todoId, "todoId");

  check(isBoolean(req.body.isDone), "isDone은 true 또는 false여야 합니다.");

  if ((await todoModel.setDone(req.user.id, id, req.body.isDone)) == 0) {
    throw new HttpError(404, "To Do을 찾을 수 없습니다.");
  }

  res.json(await findOwned(req.user.id, id));
}

// 전체 완료처ㄹㅣ
async function setAllDone(req, res) {
  res.json({ updated: await todoModel.setAllDone(req.user.id) });
}

// 투두 삭제
async function deleteTodo(req, res) {
  let id = parseId(req.params.todoId, "todoId");

  if ((await todoModel.remove(req.user.id, id)) == 0) {
    throw new HttpError(404, "To Do를 찾을 수 없습니다.");
  }

  res.status(204).end();
}

module.exports = {
  createTodo,
  getTodos,
  updateTodo,
  setDone,
  setAllDone,
  deleteTodo,
};
