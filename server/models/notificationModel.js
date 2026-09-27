const pool = require("../config/db");

// notification.type → notification_setting 컬럼 (NT-004)
const TYPES = ["notice", "schedule", "study_room"];

const NOTIFICATION_COLUMNS = `n.id, n.title, n.descript, n.type, n.target_type AS targetType,
  n.target_id AS targetId, n.created_at AS createdAt, nu.is_read AS isRead`;

async function insertNotification({ title, descript, type, targetType = null, targetId = null }) {
  if (!TYPES.includes(type)) throw new Error(`알 수 없는 알림 종류: ${type}`);
  const [result] = await pool.query(
    "INSERT INTO notification (title, descript, type, target_type, target_id) VALUES (?, ?, ?, ?, ?)",
    [title, descript, type, targetType, targetId],
  );
  return result.insertId;
}

// 알림을 만들고, 해당 카테고리 알림을 켜 둔 사용자에게만 보낸다.
// userIds가 null이면 전체 사용자 (공지, NT-005). 실제로 받은 사용자 id 목록을 돌려준다.
async function create(payload, userIds = null) {
  if (userIds !== null && userIds.length === 0) return { id: null, userIds: [] };

  const column = payload.type; // TYPES와 컬럼 이름이 같다. (insertNotification에서 검증)
  const where = userIds === null ? "" : "AND id IN (?)";
  const [receivers] = await pool.query(
    `SELECT id FROM notification_setting WHERE ${TYPES.includes(column) ? column : "FALSE"} = TRUE ${where}`,
    userIds === null ? [] : [userIds],
  );
  if (receivers.length === 0) return { id: null, userIds: [] };

  const id = await insertNotification(payload);
  await pool.query("INSERT INTO notification_user (user_id, notification_id) VALUES ?", [
    receivers.map((row) => [row.id, id]),
  ]);
  return { id, userIds: receivers.map((row) => row.id) };
}

// NT-001: 최신순. before보다 오래된 것을 limit개. type·unreadOnly로 거를 수 있다.
async function findForUser(userId, { before = null, limit, type = null, unreadOnly = false }) {
  const conditions = ["nu.user_id = ?"];
  const params = [userId];
  if (before) {
    conditions.push("n.id < ?");
    params.push(before);
  }
  if (type) {
    conditions.push("n.type = ?");
    params.push(type);
  }
  if (unreadOnly) conditions.push("nu.is_read = FALSE");

  const [rows] = await pool.query(
    `SELECT ${NOTIFICATION_COLUMNS}
     FROM notification_user nu JOIN notification n ON n.id = nu.notification_id
     WHERE ${conditions.join(" AND ")}
     ORDER BY n.id DESC LIMIT ?`,
    [...params, limit],
  );
  return rows.map((row) => ({ ...row, isRead: Boolean(row.isRead) }));
}

// NT-002: { total, notice, schedule, study_room }
async function countUnread(userId) {
  const [rows] = await pool.query(
    `SELECT n.type, COUNT(*) AS count
     FROM notification_user nu JOIN notification n ON n.id = nu.notification_id
     WHERE nu.user_id = ? AND nu.is_read = FALSE
     GROUP BY n.type`,
    [userId],
  );
  const counts = Object.fromEntries(TYPES.map((type) => [type, 0]));
  for (const { type, count } of rows) counts[type] = count;
  return { total: rows.reduce((sum, row) => sum + row.count, 0), ...counts };
}

// 내 알림이 아니면 0을 돌려준다.
async function markRead(userId, notificationId) {
  const [result] = await pool.query(
    "UPDATE notification_user SET is_read = TRUE WHERE user_id = ? AND notification_id = ?",
    [userId, notificationId],
  );
  return result.affectedRows;
}

async function markAllRead(userId, type = null) {
  await pool.query(
    `UPDATE notification_user nu JOIN notification n ON n.id = nu.notification_id
     SET nu.is_read = TRUE
     WHERE nu.user_id = ? AND nu.is_read = FALSE ${type ? "AND n.type = ?" : ""}`,
    type ? [userId, type] : [userId],
  );
}

// 초대에 응답하면 그 초대 알림은 읽은 것으로 본다.
async function markReadByTarget(userId, targetType, targetId) {
  await pool.query(
    `UPDATE notification_user nu JOIN notification n ON n.id = nu.notification_id
     SET nu.is_read = TRUE
     WHERE nu.user_id = ? AND n.target_type = ? AND n.target_id = ?`,
    [userId, targetType, targetId],
  );
}

// ----- 알림 설정 (NT-004) -----

async function findSettings(userId) {
  const [rows] = await pool.query("SELECT notice, schedule, study_room FROM notification_setting WHERE id = ?", [
    userId,
  ]);
  const row = rows[0] ?? { notice: 1, schedule: 1, study_room: 1 };
  return Object.fromEntries(TYPES.map((type) => [type, Boolean(row[type])]));
}

// fields의 키는 TYPES 중 하나여야 한다. (컨트롤러에서 확인)
async function updateSettings(userId, fields) {
  const columns = Object.keys(fields).filter((key) => TYPES.includes(key));
  if (columns.length === 0) return;
  await pool.query(
    `INSERT INTO notification_setting (id, ${columns.join(", ")}) VALUES (?, ${columns.map(() => "?").join(", ")})
     AS new ON DUPLICATE KEY UPDATE ${columns.map((c) => `${c} = new.${c}`).join(", ")}`,
    [userId, ...columns.map((c) => fields[c])],
  );
}

module.exports = {
  TYPES,
  create,
  findForUser,
  countUnread,
  markRead,
  markAllRead,
  markReadByTarget,
  findSettings,
  updateSettings,
};
