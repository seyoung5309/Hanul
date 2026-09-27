const pool = require("../config/db");

// 작성자가 탈퇴하면 chat.user_id가 NULL이 된다. (UD-009)
const CHAT_COLUMNS = `c.id, c.room_id AS roomId, c.user_id AS userId, c.message, c.time,
  COALESCE(u.name, '탈퇴한 사용자') AS name, u.identifier, u.img`;

async function create({ roomId, userId, message }) {
  const [result] = await pool.query("INSERT INTO chat (room_id, user_id, message) VALUES (?, ?, ?)", [
    roomId,
    userId,
    message,
  ]);
  return findById(result.insertId);
}

async function findById(chatId) {
  const [rows] = await pool.query(
    `SELECT ${CHAT_COLUMNS} FROM chat c LEFT JOIN user u ON u.id = c.user_id WHERE c.id = ?`,
    [chatId],
  );
  return rows[0] ?? null;
}

// before보다 오래된 채팅을 최신순으로 limit개. (before가 없으면 가장 최근부터)
async function findBefore(roomId, { before = null, limit }) {
  const [rows] = await pool.query(
    `SELECT ${CHAT_COLUMNS} FROM chat c LEFT JOIN user u ON u.id = c.user_id
     WHERE c.room_id = ? ${before ? "AND c.id < ?" : ""}
     ORDER BY c.id DESC LIMIT ?`,
    before ? [roomId, before, limit] : [roomId, limit],
  );
  return rows;
}

// 읽은 위치는 앞으로만 움직인다. (오래된 채팅을 다시 봐도 안 읽음이 늘지 않음)
async function markRead(userId, roomId, chatId) {
  await pool.query(
    `INSERT INTO chat_read_cursor (user_id, room_id, last_read_chat_id) VALUES (?, ?, ?)
     AS new ON DUPLICATE KEY UPDATE
       last_read_chat_id = GREATEST(COALESCE(chat_read_cursor.last_read_chat_id, 0), new.last_read_chat_id)`,
    [userId, roomId, chatId],
  );
}

// 방별 안 읽은 채팅 수 (CL-003, SR-011). 내 채팅과 참여하기 전 채팅은 세지 않는다.
// { roomId: count }
async function countUnread(userId) {
  const [rows] = await pool.query(
    `SELECT su.room_id AS roomId, COUNT(c.id) AS count
     FROM study_user su
     LEFT JOIN chat_read_cursor cr ON cr.user_id = su.user_id AND cr.room_id = su.room_id
     LEFT JOIN chat c ON c.room_id = su.room_id
       AND c.id > COALESCE(cr.last_read_chat_id, 0)
       AND c.time >= su.joined_at
       AND (c.user_id IS NULL OR c.user_id <> su.user_id)
     WHERE su.user_id = ?
     GROUP BY su.room_id`,
    [userId],
  );
  return Object.fromEntries(rows.map(({ roomId, count }) => [roomId, count]));
}

// 같은 채팅을 두 번 신고하면 ER_DUP_ENTRY
async function report({ chatId, reporterId, reason }) {
  const [result] = await pool.query("INSERT INTO chat_report (chat_id, reporter_id, reason) VALUES (?, ?, ?)", [
    chatId,
    reporterId,
    reason,
  ]);
  return result.insertId;
}

module.exports = { create, findById, findBefore, markRead, countUnread, report };
