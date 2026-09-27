const notificationModel = require("../models/notificationModel");
const notificationService = require("../services/notificationService");
const HttpError = require("../utils/httpError");
const { check, isBoolean } = require("../utils/validate");
const { getIO } = require("../socket");

const PAGE_SIZE = 20;
const MAX_TITLE_LENGTH = 255;
const MAX_DESCRIPT_LENGTH = 2000;

function parseType(value) {
  if (value === undefined || value === "") return null;
  check(notificationModel.TYPES.includes(value), `type은 ${notificationModel.TYPES.join(", ")} 중 하나입니다.`);
  return value;
}

// NT-001: ?before=&type=&unread=true
// 처음엔 before 없이 → 최신 20개, 더 보려면 마지막 id를 before로
async function getNotifications(req, res) {
  const before = req.query.before ? Number(req.query.before) : null;
  check(before === null || (Number.isInteger(before) && before > 0), "before를 확인해 주세요.");

  const rows = await notificationModel.findForUser(req.user.id, {
    before,
    limit: PAGE_SIZE + 1,
    type: parseType(req.query.type),
    unreadOnly: req.query.unread === "true",
  });
  res.json({ notifications: rows.slice(0, PAGE_SIZE), hasMore: rows.length > PAGE_SIZE });
}

// NT-002
async function getUnreadCount(req, res) {
  res.json(await notificationModel.countUnread(req.user.id));
}

// NT-002, NT-003: 알림을 누르면 읽음 처리 후 관련 화면으로 이동
async function markRead(req, res) {
  const id = Number(req.params.notificationId);
  check(Number.isInteger(id) && id > 0, "notificationId를 확인해 주세요.");
  if ((await notificationModel.markRead(req.user.id, id)) === 0) throw new HttpError(404, "알림을 찾을 수 없습니다.");
  res.status(204).end();
}

// NT-002: ?type= 을 주면 그 종류만
async function markAllRead(req, res) {
  await notificationModel.markAllRead(req.user.id, parseType(req.query.type));
  res.status(204).end();
}

// NT-004
async function getSettings(req, res) {
  res.json(await notificationModel.findSettings(req.user.id));
}

// NT-004: 보낸 값만 바꾼다. { notice?, schedule?, study_room? }
async function updateSettings(req, res) {
  const fields = {};
  for (const type of notificationModel.TYPES) {
    if (req.body[type] === undefined) continue;
    check(isBoolean(req.body[type]), `${type}은 true 또는 false여야 합니다.`);
    fields[type] = req.body[type];
  }
  check(Object.keys(fields).length > 0, "바꿀 설정을 보내 주세요.");

  await notificationModel.updateSettings(req.user.id, fields);
  res.json(await notificationModel.findSettings(req.user.id));
}

// NT-005: 관리자가 전체 공지 (공지 알림을 꺼 둔 사용자는 제외)
async function sendNotice(req, res) {
  const title = typeof req.body.title === "string" ? req.body.title.trim() : "";
  const descript = typeof req.body.descript === "string" ? req.body.descript.trim() : "";
  check(title.length > 0 && title.length <= MAX_TITLE_LENGTH, `제목은 1~${MAX_TITLE_LENGTH}자로 입력해 주세요.`);
  check(descript.length > 0 && descript.length <= MAX_DESCRIPT_LENGTH, `내용은 1~${MAX_DESCRIPT_LENGTH}자로 입력해 주세요.`);

  const result = await notificationService.notify(getIO(), null, { title, descript, type: "notice" });
  res.status(201).json(result); // { id, count: 받은 사람 수 }
}

module.exports = {
  getNotifications,
  getUnreadCount,
  markRead,
  markAllRead,
  getSettings,
  updateSettings,
  sendNotice,
};
