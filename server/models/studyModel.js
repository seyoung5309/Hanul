const pool = require("../config/db");
const withTransaction = require("../utils/transaction");
const { splitByKstDate } = require("../utils/date");

const SESSION_COLUMNS = `id, user_id AS userId, subject_id AS subjectId, start,
  check_deadline AS checkDeadline`;

async function findActiveSession(userId) {
  const [rows] = await pool.query(
    `SELECT ${SESSION_COLUMNS} FROM study_session WHERE user_id = ? AND status = '공부중'`,
    [userId],
  );
  return rows[0] ?? null;
}

// 이미 공부 중이면 UNIQUE (user_id, is_active)에 걸려 ER_DUP_ENTRY
async function createSession(userId, subjectId) {
  const [result] = await pool.query(
    "INSERT INTO study_session (user_id, subject_id, last_heartbeat_at) VALUES (?, ?, NOW())",
    [userId, subjectId],
  );
  return result.insertId;
}

// 방별 기록 시작. 이미 진행 중인 방은 UNIQUE에 걸려 건너뛴다.
async function startLogs(sessionId, roomIds) {
  if (roomIds.length === 0) return;
  const values = roomIds.map(() => "(?, ?, NOW())").join(", ");
  await pool.query(
    `INSERT IGNORE INTO study_log (session_id, room_id, last_heartbeat_at) VALUES ${values}`,
    roomIds.flatMap((roomId) => [sessionId, roomId]),
  );
}

async function endLogs(sessionId, roomIds) {
  if (roomIds.length === 0) return;
  await pool.query(
    `UPDATE study_log SET status = '종료', end = NOW()
     WHERE session_id = ? AND room_id IN (?) AND status = '공부중'`,
    [sessionId, roomIds],
  );
}

async function touchHeartbeat(sessionId, roomIds) {
  await pool.query("UPDATE study_session SET last_heartbeat_at = NOW() WHERE id = ? AND status = '공부중'", [
    sessionId,
  ]);
  if (roomIds.length === 0) return;
  await pool.query(
    `UPDATE study_log SET last_heartbeat_at = NOW()
     WHERE session_id = ? AND room_id IN (?) AND status = '공부중'`,
    [sessionId, roomIds],
  );
}

// '응답' 버튼: 다음 확인까지 다시 3시간
async function confirmCheck(sessionId) {
  await pool.query(
    "UPDATE study_session SET confirmed_at = NOW(), check_deadline = NULL WHERE id = ? AND status = '공부중'",
    [sessionId],
  );
}

// 세션과 방별 기록을 끝내고, 공부 시간을 날짜별로 나눠 study_daily에 더한다.
// endAt이 null이면 지금 시각. 이미 끝난 세션이면 null을 돌려준다. (종료 버튼과 자동 종료가 겹친 경우)
async function endSession(sessionId, { status, endAt = null }) {
  return withTransaction(async (conn) => {
    const [[session]] = await conn.query(
      "SELECT id, user_id AS userId FROM study_session WHERE id = ? AND status = '공부중' FOR UPDATE",
      [sessionId],
    );
    if (!session) return null;

    await conn.query(
      `UPDATE study_session
       SET status = ?, end = GREATEST(start, COALESCE(?, NOW())), check_deadline = NULL
       WHERE id = ?`,
      [status, endAt, sessionId],
    );
    const [[{ start, end }]] = await conn.query("SELECT start, end FROM study_session WHERE id = ?", [sessionId]);

    await conn.query(
      `UPDATE study_log SET status = ?, end = GREATEST(start, ?)
       WHERE session_id = ? AND status = '공부중'`,
      [status, end, sessionId],
    );

    const daily = splitByKstDate(start, end);
    if (daily.length > 0) {
      await conn.query(
        `INSERT INTO study_daily (user_id, date, seconds) VALUES ?
         AS new ON DUPLICATE KEY UPDATE seconds = study_daily.seconds + new.seconds`,
        [daily.map(({ date, seconds }) => [session.userId, date, seconds])],
      );
    }
    return { ...session, start, end };
  });
}

// 공부 상태·시간을 어디까지 보여줄지 (UD-008)
async function findVisibility(userId) {
  const [rows] = await pool.query(
    "SELECT status_visibility AS status, time_visibility AS time FROM user WHERE id = ?",
    [userId],
  );
  return rows[0] ?? { status: "private", time: "private" };
}

// ----- 자동 종료 작업용 (jobs) -----

// heartbeat가 끊긴 세션. 마지막 응답 시각에 끝난 것으로 본다.
async function findDisconnectedSessions(timeoutSeconds) {
  const [rows] = await pool.query(
    `SELECT id, user_id AS userId, COALESCE(last_heartbeat_at, start) AS endAt
     FROM study_session
     WHERE status = '공부중' AND COALESCE(last_heartbeat_at, start) < NOW() - INTERVAL ? SECOND`,
    [timeoutSeconds],
  );
  return rows;
}

// 창이 닫혀 heartbeat가 끊긴 방별 기록을 끝낸다.
async function endDisconnectedLogs(timeoutSeconds) {
  await pool.query(
    `UPDATE study_log SET status = '자동종료', end = GREATEST(start, COALESCE(last_heartbeat_at, start))
     WHERE status = '공부중' AND COALESCE(last_heartbeat_at, start) < NOW() - INTERVAL ? SECOND`,
    [timeoutSeconds],
  );
}

// 마지막 응답 후 intervalSeconds가 지난 세션에 확인 마감 시각을 건다.
async function startChecks(intervalSeconds, responseSeconds) {
  const [rows] = await pool.query(
    `SELECT id FROM study_session
     WHERE status = '공부중' AND check_deadline IS NULL
       AND COALESCE(confirmed_at, start) <= NOW() - INTERVAL ? SECOND`,
    [intervalSeconds],
  );
  if (rows.length === 0) return [];

  const ids = rows.map((row) => row.id);
  await pool.query(
    `UPDATE study_session SET check_deadline = NOW() + INTERVAL ? SECOND
     WHERE id IN (?) AND status = '공부중' AND check_deadline IS NULL`,
    [responseSeconds, ids],
  );
  const [started] = await pool.query(
    `SELECT id, user_id AS userId, check_deadline AS checkDeadline FROM study_session
     WHERE id IN (?) AND status = '공부중' AND check_deadline IS NOT NULL`,
    [ids],
  );
  return started;
}

// 응답 마감이 지난 세션. 확인 창이 뜬 시각에 끝난 것으로 본다.
async function findExpiredChecks(responseSeconds) {
  const [rows] = await pool.query(
    `SELECT id, user_id AS userId, check_deadline - INTERVAL ? SECOND AS endAt
     FROM study_session WHERE status = '공부중' AND check_deadline < NOW()`,
    [responseSeconds],
  );
  return rows;
}

module.exports = {
  findActiveSession,
  createSession,
  startLogs,
  endLogs,
  touchHeartbeat,
  confirmCheck,
  endSession,
  findVisibility,
  findDisconnectedSessions,
  endDisconnectedLogs,
  startChecks,
  findExpiredChecks,
};
