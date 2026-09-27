const pool = require("../config/db");

// 여러 쿼리를 하나의 트랜잭션으로 묶는다. fn 안에서 에러가 나면 전부 되돌린다.
// 사용: await withTransaction(async (conn) => { await model.create(conn, ...); });
async function withTransaction(fn) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

module.exports = withTransaction;
