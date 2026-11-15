const pool = require("../config/db");

// 작성자가 탈퇴하면 chat.user_id가 NULL
const CHAT_COLUMNS = `c.id, c.room_id AS roomId, c.user_id AS userId, c.message, c.time,
  COALESCE(u.name, '탈퇴한 사용자') AS name, u.identifier, u.img`;

// 채팅 자체를 생성
async function create({ roomId, userId, message }) {
  const [result] = await pool.query(
    "INSERT INTO chat (room_id, user_id, message) VALUES (?, ?, ?)",
    [roomId, userId, message],
  );
  return findById(result.insertId);
}

// 채팅으로 누가 보낸 건지 찾기
async function findById(chatId) {
  const [rows] = await pool.query(
    `SELECT ${CHAT_COLUMNS} FROM chat c LEFT JOIN user u ON u.id = c.user_id WHERE c.id = ?`,
    [chatId],
  );
  return rows[0] ?? null;
}

// 예전에 보낸 채팅 찾기
async function findBefore(roomId, { before = null, limit }) {
  const [rows] = await pool.query(
    `SELECT ${CHAT_COLUMNS} FROM chat c LEFT JOIN user u ON u.id = c.user_id
     WHERE c.room_id = ? ${before ? "AND c.id < ?" : ""}
     ORDER BY c.id DESC LIMIT ?`,
    before ? [roomId, before, limit] : [roomId, limit],
  );
  return rows;
}

// 읽은 채팅은 무엇인가?
async function markRead(userId, roomId, chatId) {
  await pool.query(
    `INSERT INTO chat_read_cursor (user_id, room_id, last_read_chat_id) VALUES (?, ?, ?)
     AS new ON DUPLICATE KEY UPDATE
       last_read_chat_id = GREATEST(COALESCE(chat_read_cursor.last_read_chat_id, 0), new.last_read_chat_id)`,
    [userId, roomId, chatId],
  );
}

// 방 별로 안 읽은 채팅 개수
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

// 채팅 신고
async function report({ chatId, reporterId, reason }) {
  const [result] = await pool.query(
    "INSERT INTO chat_report (chat_id, reporter_id, reason) VALUES (?, ?, ?)",
    [chatId, reporterId, reason],
  );
  return result.insertId;
}

module.exports = {
  create,
  findById,
  findBefore,
  markRead,
  countUnread,
  report,
};
