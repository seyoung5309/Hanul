const pool = require("../config/db");

// notification.type → notification_setting 컬럼 (NT-004)
const SETTING_COLUMNS = { notice: "notice", schedule: "schedule", study_room: "study_room" };

// 알림을 만들고, 해당 카테고리 알림을 켜 둔 사용자에게만 보낸다.
// 실제로 받은 사용자 id 목록을 돌려준다.
async function create({ title, descript, type, targetType = null, targetId = null }, userIds) {
  const column = SETTING_COLUMNS[type];
  if (!column) throw new Error(`알 수 없는 알림 종류: ${type}`);
  if (userIds.length === 0) return { id: null, userIds: [] };

  const [receivers] = await pool.query(`SELECT id FROM notification_setting WHERE id IN (?) AND ${column} = TRUE`, [
    userIds,
  ]);
  if (receivers.length === 0) return { id: null, userIds: [] };

  const [result] = await pool.query(
    "INSERT INTO notification (title, descript, type, target_type, target_id) VALUES (?, ?, ?, ?, ?)",
    [title, descript, type, targetType, targetId],
  );
  await pool.query("INSERT INTO notification_user (user_id, notification_id) VALUES ?", [
    receivers.map(({ id }) => [id, result.insertId]),
  ]);
  return { id: result.insertId, userIds: receivers.map(({ id }) => id) };
}

module.exports = { create };
