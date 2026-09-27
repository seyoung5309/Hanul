const pool = require("../config/db");

// NF-005: 방 데이터에 접근하기 전에 참가자인지 확인
async function isMember(userId, roomId) {
  const [rows] = await pool.query("SELECT 1 FROM study_user WHERE user_id = ? AND room_id = ?", [userId, roomId]);
  return rows.length > 0;
}

// 참여 중인 방 (반 메인 포함)
async function findUserRooms(userId) {
  const [rows] = await pool.query(
    `SELECT r.id, r.type FROM study_user su JOIN study_room r ON r.id = su.room_id
     WHERE su.user_id = ?`,
    [userId],
  );
  return rows;
}

module.exports = { isMember, findUserRooms };
