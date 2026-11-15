const pool = require("../config/db");

// 모든 조회, 수정은 user_id로 본인 것만 다룸.
const COLUMNS = "id, title, descript, date, created_at AS createdAt";

// 일정 생성하기
async function create(conn, { userId, title, descript, date }) {
  const [result] = await conn.query(
    "INSERT INTO schedule (user_id, title, descript, date) VALUES (?, ?, ?, ?)",
    [userId, title, descript, date],
  );
  return result.insertId;
}

// 내 일정 찾기
async function findOne(userId, id) {
  const [rows] = await pool.query(
    `SELECT ${COLUMNS} FROM schedule WHERE id = ? AND user_id = ?`,
    [id, userId],
  );
  return rows[0] ?? null;
}

// 날짜 범위 안에 일정 찾기
async function findRange(userId, { from = null, to = null, limit = null }) {
  const conditions = ["user_id = ?"];
  const params = [userId];

  if (from) {
    conditions.push("date >= ?");
    params.push(from);
  }

  if (to) {
    conditions.push("date < ?");
    params.push(to);
  }

  const [rows] = await pool.query(
    `SELECT ${COLUMNS} FROM schedule WHERE ${conditions.join(" AND ")} ORDER BY date, id${limit ? " LIMIT ?" : ""}`,
    limit ? [...params, limit] : params,
  );

  return rows;
}

// 일정 수정하기
async function update(conn, userId, id, fields) {
  const sets = Object.keys(fields).map((column) => `${column} = ?`);

  if ("date" in fields) {
    sets.push("notified_at = NULL");
  }

  if (sets.length == 0) {
    return;
  }

  await conn.query(
    `UPDATE schedule SET ${sets.join(", ")} WHERE id = ? AND user_id = ?`,
    [...Object.values(fields), id, userId],
  );
}

// 일정 삭제하기
async function remove(userId, id) {
  const [result] = await pool.query(
    "DELETE FROM schedule WHERE id = ? AND user_id = ?",
    [id, userId],
  );
  return result.affectedRows;
}

// 으악! 임박한 일정이다
async function findDueSoon(hours) {
  const [rows] = await pool.query(
    `SELECT id, user_id AS userId, title, date FROM schedule
     WHERE notified_at IS NULL AND date > NOW() AND date <= NOW() + INTERVAL ? HOUR`,
    [hours],
  );
  return rows;
}

// 확인한 일정
async function markNotified(ids) {
  if (ids.length == 0) {
    return;
  }

  await pool.query("UPDATE schedule SET notified_at = NOW() WHERE id IN (?)", [
    ids,
  ]);
}

module.exports = {
  create,
  findOne,
  findRange,
  update,
  remove,
  findDueSoon,
  markNotified,
};
