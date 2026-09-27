const pool = require("../config/db");

// 반이 없으면 만들고, 있으면 기존 id를 돌려준다.
async function findOrCreateClass(conn, { year, grade, classNo }) {
  const [result] = await conn.query(
    `INSERT INTO class (year, grade, class) VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id)`,
    [year, grade, classNo],
  );
  return result.insertId;
}

// 반 메인(type='class' 공부방)이 없으면 만들고, 있으면 기존 id를 돌려준다.
async function findOrCreateClassRoom(conn, { classId, title }) {
  const [result] = await conn.query(
    `INSERT INTO study_room (type, class_id, title) VALUES ('class', ?, ?)
     ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id)`,
    [classId, title],
  );
  return result.insertId;
}

// 해당 학년도 소속을 새로 등록한다. (같은 학년도에 이미 있으면 교체)
async function setClassUser(conn, { classId, userId, year, number }) {
  await conn.query("DELETE FROM class_user WHERE user_id = ? AND year = ?", [userId, year]);
  await conn.query("INSERT INTO class_user (class_id, user_id, year, number) VALUES (?, ?, ?, ?)", [
    classId,
    userId,
    year,
    number,
  ]);
}

// 이전 반 메인에서 나간다. (class_user 기록은 남김)
async function leaveClassRooms(conn, userId) {
  await conn.query(
    `DELETE su FROM study_user su JOIN study_room r ON r.id = su.room_id
     WHERE su.user_id = ? AND r.type = 'class'`,
    [userId],
  );
}

async function joinRoom(conn, { userId, roomId }) {
  await conn.query("INSERT IGNORE INTO study_user (user_id, room_id) VALUES (?, ?)", [userId, roomId]);
}

async function findUserClass(userId, year) {
  const [rows] = await pool.query(
    `SELECT c.year, c.grade, c.class AS classNo, cu.number, r.id AS roomId
     FROM class_user cu
     JOIN class c ON c.id = cu.class_id
     LEFT JOIN study_room r ON r.class_id = c.id
     WHERE cu.user_id = ? AND cu.year = ?`,
    [userId, year],
  );
  return rows[0] ?? null;
}

module.exports = {
  findOrCreateClass,
  findOrCreateClassRoom,
  setClassUser,
  leaveClassRooms,
  joinRoom,
  findUserClass,
};
