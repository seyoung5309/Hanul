const chatModel = require("../models/chatModel");
const HttpError = require("../utils/httpError");
const { check } = require("../utils/validate");
const { parseId, loadMemberRoom } = require("./roomController");

const PAGE_SIZE = 30;
const MAX_REASON_LENGTH = 255;

// CL-002: 이전 채팅 (새 채팅은 소켓 chat:new)
// 처음엔 before 없이 → 최근 30개, 위로 스크롤하면 가장 오래된 id를 before로 → 그 이전 30개
async function getChats(req, res) {
  const room = await loadMemberRoom(req);
  const before = req.query.before ? parseId(req.query.before, "before") : null;

  const rows = await chatModel.findBefore(room.id, { before, limit: PAGE_SIZE + 1 });
  const hasMore = rows.length > PAGE_SIZE;
  res.json({ chats: rows.slice(0, PAGE_SIZE).reverse(), hasMore }); // 오래된 → 최신 순
}

// CL-003: 여기까지 읽음
async function markRead(req, res) {
  const room = await loadMemberRoom(req);
  const chatId = parseId(req.body.chatId, "chatId");

  const chat = await chatModel.findById(chatId);
  if (!chat || chat.roomId !== room.id) throw new HttpError(404, "채팅을 찾을 수 없습니다.");

  await chatModel.markRead(req.user.id, room.id, chatId);
  res.status(204).end();
}

// CL-003, SR-011: 방별 안 읽은 채팅 수 { roomId: count }
async function getUnreadCounts(req, res) {
  res.json(await chatModel.countUnread(req.user.id));
}

// CL-004
async function reportChat(req, res) {
  const room = await loadMemberRoom(req);
  const chatId = parseId(req.params.chatId, "chatId");
  const reason = typeof req.body.reason === "string" ? req.body.reason.trim() : "";
  check(reason.length > 0 && reason.length <= MAX_REASON_LENGTH, `신고 사유는 1~${MAX_REASON_LENGTH}자로 입력해 주세요.`);

  const chat = await chatModel.findById(chatId);
  if (!chat || chat.roomId !== room.id) throw new HttpError(404, "채팅을 찾을 수 없습니다.");
  check(chat.userId !== req.user.id, "내 채팅은 신고할 수 없습니다.");

  try {
    const id = await chatModel.report({ chatId, reporterId: req.user.id, reason });
    res.status(201).json({ id });
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY") throw new HttpError(409, "이미 신고한 채팅입니다.");
    throw err;
  }
}

module.exports = { getChats, markRead, getUnreadCounts, reportChat };
