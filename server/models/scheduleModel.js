const pool = require("../config/db");

// 모든 조회·수정은 user_id로 본인 것만 다룬다.
const COLUMNS = "id, title, descript, date, created_at AS createdAt";

async function create(conn, { userId, title, descript, date }) {
  const [result] = await conn.query("INSERT INTO schedule (user_id, title, descript, date) VALUES (?, ?, ?, ?)", [
    userId,
    title,
    descript,
    date,
  ]);
  return result.insertId;
}

async function findOne(userId, id) {
  const [rows] = await pool.query(`SELECT ${COLUMNS} FROM schedule WHERE id = ? AND user_id = ?`, [id, userId]);
  return rows[0] ?? null;
}

// from <= date < to (둘 다 "YYYY-MM-DD HH:mm:ss", 없으면 제한 없음). 날짜순.
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

// fields: { title?, descript?, date? } — 날짜가 바뀌면 알림을 다시 보낼 수 있게 notified_at을 비운다.
async function update(conn, userId, id, fields) {
  const sets = Object.keys(fields).map((column) => `${column} = ?`);
  if ("date" in fields) sets.push("notified_at = NULL");
  if (sets.length === 0) return;
  await conn.query(`UPDATE schedule SET ${sets.join(", ")} WHERE id = ? AND user_id = ?`, [
    ...Object.values(fields),
    id,
    userId,
  ]);
}

async function remove(userId, id) {
  const [result] = await pool.query("DELETE FROM schedule WHERE id = ? AND user_id = ?", [id, userId]);
  return result.affectedRows;
}

// TD-007: 아직 알리지 않았고, 지금부터 hours시간 안에 있는 일정
async function findDueSoon(hours) {
  const [rows] = await pool.query(
    `SELECT id, user_id AS userId, title, date FROM schedule
     WHERE notified_at IS NULL AND date > NOW() AND date <= NOW() + INTERVAL ? HOUR`,
    [hours],
  );
  return rows;
}

async function markNotified(ids) {
  if (ids.length === 0) return;
  await pool.query("UPDATE schedule SET notified_at = NOW() WHERE id IN (?)", [ids]);
}

module.exports = { create, findOne, findRange, update, remove, findDueSoon, markNotified };
