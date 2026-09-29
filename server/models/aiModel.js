const pool = require("../config/db");

// ----- 대화방 (ai_room) — 모두 user_id로 본인 것만 -----

const ROOM_COLUMNS = `id, title, summary, summary_chat_id AS summaryChatId,
  created_at AS createdAt, updated_at AS updatedAt`;

async function createRoom(userId, title) {
  const [result] = await pool.query("INSERT INTO ai_room (user_id, title) VALUES (?, ?)", [userId, title]);
  return result.insertId;
}

async function findRoom(userId, roomId) {
  const [rows] = await pool.query(`SELECT ${ROOM_COLUMNS} FROM ai_room WHERE id = ? AND user_id = ?`, [
    roomId,
    userId,
  ]);
  return rows[0] ?? null;
}

// AI-006: 최근 대화한 순
async function findRooms(userId) {
  const [rows] = await pool.query(
    "SELECT id, title, created_at AS createdAt, updated_at AS updatedAt FROM ai_room WHERE user_id = ? ORDER BY updated_at DESC, id DESC",
    [userId],
  );
  return rows;
}

async function deleteRoom(userId, roomId) {
  const [result] = await pool.query("DELETE FROM ai_room WHERE id = ? AND user_id = ?", [roomId, userId]);
  return result.affectedRows;
}

// 목록 정렬용 (채팅이 추가될 때)
async function touchRoom(roomId) {
  await pool.query("UPDATE ai_room SET updated_at = NOW() WHERE id = ?", [roomId]);
}

async function updateSummary(roomId, summary, summaryChatId) {
  await pool.query("UPDATE ai_room SET summary = ?, summary_chat_id = ? WHERE id = ?", [summary, summaryChatId, roomId]);
}

// ----- 대화 (ai_chat) -----

const CHAT_COLUMNS = "id, role, comment AS text, date";

async function addChat(roomId, role, text, tokens = null) {
  const [result] = await pool.query("INSERT INTO ai_chat (ai_room_id, role, comment, tokens) VALUES (?, ?, ?, ?)", [
    roomId,
    role,
    text,
    tokens,
  ]);
  return { id: result.insertId, role, text, date: new Date() };
}

// AI 호출이 실패하면 방금 저장한 질문을 지워 기록을 깔끔하게 둔다.
async function deleteChat(chatId) {
  await pool.query("DELETE FROM ai_chat WHERE id = ?", [chatId]);
}

async function findChats(roomId) {
  const [rows] = await pool.query(`SELECT ${CHAT_COLUMNS} FROM ai_chat WHERE ai_room_id = ? ORDER BY id`, [roomId]);
  return rows;
}

// 요약에 들어가지 않은 채팅 (afterId 이후)
async function findChatsAfter(roomId, afterId) {
  const [rows] = await pool.query(`SELECT ${CHAT_COLUMNS} FROM ai_chat WHERE ai_room_id = ? AND id > ? ORDER BY id`, [
    roomId,
    afterId ?? 0,
  ]);
  return rows;
}

// ----- 사용량 (ai_usage) -----

// AI-003: 오늘(KST) 요청 수
async function findTodayCount(userId) {
  const [rows] = await pool.query("SELECT count FROM ai_usage WHERE user_id = ? AND date = CURDATE()", [userId]);
  return rows[0]?.count ?? 0;
}

// countRequest가 false면 토큰만 더한다. (대화 요약처럼 사용자가 요청하지 않은 호출)
async function addUsage(userId, tokens, { countRequest = true } = {}) {
  await pool.query(
    `INSERT INTO ai_usage (user_id, date, count, tokens) VALUES (?, CURDATE(), ?, ?)
     AS new ON DUPLICATE KEY UPDATE count = ai_usage.count + new.count, tokens = ai_usage.tokens + new.tokens`,
    [userId, countRequest ? 1 : 0, tokens],
  );
}

// NF-010: 이번 달 전체 사용자 토큰 합
async function sumMonthTokens() {
  const [[row]] = await pool.query(
    "SELECT COALESCE(SUM(tokens), 0) AS tokens FROM ai_usage WHERE date >= DATE_FORMAT(CURDATE(), '%Y-%m-01')",
  );
  return Number(row.tokens);
}

module.exports = {
  createRoom,
  findRoom,
  findRooms,
  deleteRoom,
  touchRoom,
  updateSummary,
  addChat,
  deleteChat,
  findChats,
  findChatsAfter,
  findTodayCount,
  addUsage,
  sumMonthTokens,
};
