const pool = require("../config/db");

// 과목 전부 불러오기
async function findAll() {
  const [rows] = await pool.query("SELECT id, name FROM subject ORDER BY id");
  return rows;
}

// 일정, To Do처럼 과목을 연결하는 테이블
const LINK_TABLES = {
  schedule: { table: "schedule_subject", column: "schedule_id" },
  todo: { table: "todo_subject", column: "todo_id" },
};

// 일정이나 투두나 과목과 관련된 거 찾기 { ownerId: [{ id, name }] }
async function findLinked(kind, ownerIds) {
  const { table, column } = LINK_TABLES[kind];
  const result = Object.fromEntries(ownerIds.map((id) => [id, []]));

  if (ownerIds.length === 0) {
    return result;
  }

  const [rows] = await pool.query(
    `SELECT l.${column} AS ownerId, s.id, s.name FROM ${table} l JOIN subject s ON s.id = l.subject_id
     WHERE l.${column} IN (?) ORDER BY l.id`,
    [ownerIds],
  );

  for (const { ownerId, id, name } of rows) {
    result[ownerId].push({ id, name });
  }

  return result;
}

// 없는 과목 id면 에러!!!!
async function replaceLinked(conn, kind, ownerId, subjectIds) {
  const { table, column } = LINK_TABLES[kind];

  await conn.query(`DELETE FROM ${table} WHERE ${column} = ?`, [ownerId]);

  if (subjectIds.length === 0) {
    return;
  }

  await conn.query(`INSERT INTO ${table} (${column}, subject_id) VALUES ?`, [
    subjectIds.map((subjectId) => [ownerId, subjectId]),
  ]);
}

module.exports = { findAll, findLinked, replaceLinked };
