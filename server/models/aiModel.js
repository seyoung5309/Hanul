const pool = require("../config/db");

const ROOM_COLUMNS = `id, title, summary, summary_chat_id AS summaryChatId,
  created_at AS createdAt, updated_at AS updatedAt`;

// 방 생성
async function createRoom(userId, title) {
  const [result] = await pool.query(
    "INSERT INTO ai_room (user_id, title) VALUES (?, ?)",
    [userId, title],
  );
  return result.insertId;
}

// 방 찾기
async function findRoom(userId, roomId) {
  const [rows] = await pool.query(
    `SELECT ${ROOM_COLUMNS} FROM ai_room WHERE id = ? AND user_id = ?`,
    [roomId, userId],
  );
  return rows[0] ?? null;
}

// 최근 대화순으로 방 목록
async function findRooms(userId) {
  const [rows] = await pool.query(
    `SELECT r.id, r.title, r.created_at AS createdAt, r.updated_at AS updatedAt
     FROM ai_room r
     WHERE r.user_id = ?
     ORDER BY r.updated_at DESC, (SELECT MAX(c.id) FROM ai_chat c WHERE c.ai_room_id = r.id) DESC, r.id DESC`,
    [userId],
  );
  return rows;
}

// 방 삭제
async function deleteRoom(userId, roomId) {
  const [result] = await pool.query(
    "DELETE FROM ai_room WHERE id = ? AND user_id = ?",
    [roomId, userId],
  );
  return result.affectedRows;
}

// 목록 정렬용 (채팅이 추가될 때)
async function touchRoom(roomId) {
  await pool.query("UPDATE ai_room SET updated_at = NOW() WHERE id = ?", [
    roomId,
  ]);
}

// AI 요약 정보 수정
async function updateSummary(roomId, summary, summaryChatId) {
  await pool.query(
    "UPDATE ai_room SET summary = ?, summary_chat_id = ? WHERE id = ?",
    [summary, summaryChatId, roomId],
  );
}

const CHAT_COLUMNS = "id, role, comment AS text, date";

// 채팅 추가
async function addChat(roomId, role, text, tokens = null) {
  const [result] = await pool.query(
    "INSERT INTO ai_chat (ai_room_id, role, comment, tokens) VALUES (?, ?, ?, ?)",
    [roomId, role, text, tokens],
  );
  return { id: result.insertId, role, text, date: new Date() };
}

// 채팅 삭제 (AI 답변 생성 실패 시에)
async function deleteChat(chatId) {
  await pool.query("DELETE FROM ai_chat WHERE id = ?", [chatId]);
}

// 채팅 목록 불러오기
async function findChats(roomId) {
  const [rows] = await pool.query(
    `SELECT ${CHAT_COLUMNS} FROM ai_chat WHERE ai_room_id = ? ORDER BY id`,
    [roomId],
  );
  return rows;
}

// 요약에 들어가지 않은 채팅
async function findChatsAfter(roomId, afterId) {
  const [rows] = await pool.query(
    `SELECT ${CHAT_COLUMNS} FROM ai_chat WHERE ai_room_id = ? AND id > ? ORDER BY id`,
    [roomId, afterId ?? 0],
  );
  return rows;
}

// 채팅 사용량 불러오기
async function findTodayCount(userId) {
  const [rows] = await pool.query(
    "SELECT count FROM ai_usage WHERE user_id = ? AND date = CURDATE()",
    [userId],
  );
  return rows[0]?.count ?? 0;
}

// 대화 요약 같은 경우엔 사용자 요청이 아니라서 하나 추가해 줘야 함
async function addUsage(userId, tokens, { countRequest = true } = {}) {
  await pool.query(
    `INSERT INTO ai_usage (user_id, date, count, tokens) VALUES (?, CURDATE(), ?, ?)
     AS new ON DUPLICATE KEY UPDATE count = ai_usage.count + new.count, tokens = ai_usage.tokens + new.tokens`,
    [userId, countRequest ? 1 : 0, tokens],
  );
}

// 이번달 토큰 합
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
