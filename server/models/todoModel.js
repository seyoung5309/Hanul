const pool = require("../config/db");

// 모든 조회·수정은 user_id로 본인 것만 다룬다.
const COLUMNS = "id, title, descript, due_date AS dueDate, is_do AS isDone, created_at AS createdAt";

const toTodo = (row) => row && { ...row, isDone: Boolean(row.isDone) };

async function create(conn, { userId, title, descript, dueDate }) {
  const [result] = await conn.query("INSERT INTO todo (user_id, title, descript, due_date) VALUES (?, ?, ?, ?)", [
    userId,
    title,
    descript,
    dueDate,
  ]);
  return result.insertId;
}

async function findOne(userId, id) {
  const [rows] = await pool.query(`SELECT ${COLUMNS} FROM todo WHERE id = ? AND user_id = ?`, [id, userId]);
  return toTodo(rows[0]) ?? null;
}

// 안 한 것 먼저 → 마감 가까운 순(마감 없는 건 뒤) → 최근 등록 순
async function findAll(userId, { done = null } = {}) {
  const [rows] = await pool.query(
    `SELECT ${COLUMNS} FROM todo WHERE user_id = ?${done === null ? "" : " AND is_do = ?"}
     ORDER BY is_do, due_date IS NULL, due_date, id DESC`,
    done === null ? [userId] : [userId, done],
  );
  return rows.map(toTodo);
}

// fields: { title?, descript?, due_date? } — 마감이 바뀌면 알림을 다시 보낼 수 있게 notified_at을 비운다.
async function update(conn, userId, id, fields) {
  const sets = Object.keys(fields).map((column) => `${column} = ?`);
  if ("due_date" in fields) sets.push("notified_at = NULL");
  if (sets.length === 0) return;
  await conn.query(`UPDATE todo SET ${sets.join(", ")} WHERE id = ? AND user_id = ?`, [
    ...Object.values(fields),
    id,
    userId,
  ]);
}

// TD-006
async function setDone(userId, id, isDone) {
  const [result] = await pool.query("UPDATE todo SET is_do = ? WHERE id = ? AND user_id = ?", [isDone, id, userId]);
  return result.affectedRows;
}

// '전체 완료 처리하기'. 바뀐 개수를 돌려준다.
async function setAllDone(userId) {
  const [result] = await pool.query("UPDATE todo SET is_do = TRUE WHERE user_id = ? AND is_do = FALSE", [userId]);
  return result.affectedRows;
}

async function remove(userId, id) {
  const [result] = await pool.query("DELETE FROM todo WHERE id = ? AND user_id = ?", [id, userId]);
  return result.affectedRows;
}

// TD-007: 아직 알리지 않았고, 완료하지 않았고, 지금부터 hours시간 안에 마감인 할 일
async function findDueSoon(hours) {
  const [rows] = await pool.query(
    `SELECT id, user_id AS userId, title, due_date AS dueDate FROM todo
     WHERE notified_at IS NULL AND is_do = FALSE AND due_date > NOW() AND due_date <= NOW() + INTERVAL ? HOUR`,
    [hours],
  );
  return rows;
}

async function markNotified(ids) {
  if (ids.length === 0) return;
  await pool.query("UPDATE todo SET notified_at = NOW() WHERE id IN (?)", [ids]);
}

module.exports = { create, findOne, findAll, update, setDone, setAllDone, remove, findDueSoon, markNotified };
