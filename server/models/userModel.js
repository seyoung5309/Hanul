const pool = require("../config/db");

// 트랜잭션 안에서 부르는 함수는 첫 인자로 conn을 받는다. (utils/transaction.js)

// ----- 계정 (auth) -----

async function findAuthByEmail(email) {
  const [rows] = await pool.query("SELECT id, password, role FROM auth WHERE email = ?", [email]);
  return rows[0];
}

async function findAuthById(id) {
  const [rows] = await pool.query("SELECT id, email, password, role FROM auth WHERE id = ?", [id]);
  return rows[0];
}

async function existsEmail(email) {
  const [rows] = await pool.query("SELECT 1 FROM auth WHERE email = ?", [email]);
  return rows.length > 0;
}

async function existsIdentifier(identifier) {
  const [rows] = await pool.query("SELECT 1 FROM user WHERE identifier = ?", [identifier]);
  return rows.length > 0;
}

async function createAuth(conn, { email, passwordHash, termsVersion }) {
  const [result] = await conn.query(
    "INSERT INTO auth (email, password, terms_version, agreed_at) VALUES (?, ?, ?, NOW())",
    [email, passwordHash, termsVersion],
  );
  return result.insertId;
}

async function updatePassword(conn, authId, passwordHash) {
  await conn.query("UPDATE auth SET password = ? WHERE id = ?", [passwordHash, authId]);
}

// user, study_user, chat(작성자 NULL) 등은 FK로 함께 정리된다.
async function deleteAuth(id) {
  await pool.query("DELETE FROM auth WHERE id = ?", [id]);
}

// ----- 프로필 (user) -----

async function createUser(conn, { id, identifier, name, birth, gender, startYear }) {
  await conn.query(
    "INSERT INTO user (id, identifier, name, birth, gender, start_year) VALUES (?, ?, ?, ?, ?, ?)",
    [id, identifier, name, birth, gender, startYear],
  );
  await conn.query("INSERT INTO notification_setting (id) VALUES (?)", [id]);
}

async function findProfile(id) {
  const [rows] = await pool.query(
    `SELECT u.id, a.email, a.role, u.identifier, u.name, u.birth, u.gender, u.img, u.comment,
            u.start_year AS startYear,
            u.status_visibility AS statusVisibility, u.time_visibility AS timeVisibility,
            u.hide_ranking AS hideRanking, u.hide_ranking_view AS hideRankingView
     FROM user u JOIN auth a ON a.id = u.id
     WHERE u.id = ?`,
    [id],
  );
  return rows[0];
}

// 컬럼 이름은 컨트롤러에서 정해진 것만 넘긴다. (사용자 입력을 컬럼명으로 쓰지 않음)
async function updateUser(id, fields, conn = pool) {
  const columns = Object.keys(fields);
  if (columns.length === 0) return;
  const setClause = columns.map((column) => `${column} = ?`).join(", ");
  await conn.query(`UPDATE user SET ${setClause} WHERE id = ?`, [...Object.values(fields), id]);
}

// 아이디 앞부분으로 검색 (SR-008 초대용)
async function searchByIdentifier(keyword, excludeId) {
  const escaped = keyword.replace(/[\\%_]/g, "\\$&");
  const [rows] = await pool.query(
    `SELECT id, identifier, name, img FROM user
     WHERE identifier LIKE ? AND id <> ?
     ORDER BY identifier LIMIT 10`,
    [`${escaped}%`, excludeId],
  );
  return rows;
}

// ----- 관심 과목 (subject_like) -----

async function findLikedSubjects(userId) {
  const [rows] = await pool.query(
    `SELECT s.id, s.name FROM subject_like sl JOIN subject s ON s.id = sl.subject_id
     WHERE sl.user_id = ? ORDER BY sl.id`,
    [userId],
  );
  return rows;
}

async function replaceLikedSubjects(conn, userId, subjectIds) {
  await conn.query("DELETE FROM subject_like WHERE user_id = ?", [userId]);
  if (subjectIds.length === 0) return;
  await conn.query("INSERT INTO subject_like (user_id, subject_id) VALUES ?", [
    subjectIds.map((subjectId) => [userId, subjectId]),
  ]);
}

// ----- 탈퇴 전 확인 -----

async function countOwnedRooms(userId) {
  const [[row]] = await pool.query("SELECT COUNT(*) AS count FROM study_room WHERE owner_id = ?", [userId]);
  return row.count;
}

// ----- 비밀번호 재설정 (password_reset) -----

async function createPasswordReset({ authId, tokenHash, expiresAt }) {
  await pool.query("INSERT INTO password_reset (auth_id, token_hash, expires_at) VALUES (?, ?, ?)", [
    authId,
    tokenHash,
    expiresAt,
  ]);
}

async function findValidPasswordReset(tokenHash) {
  const [rows] = await pool.query(
    `SELECT id, auth_id AS authId FROM password_reset
     WHERE token_hash = ? AND used_at IS NULL AND expires_at > NOW()`,
    [tokenHash],
  );
  return rows[0];
}

// 사용한 토큰과 같은 계정의 다른 토큰까지 모두 사용 처리
async function usePasswordResets(conn, authId) {
  await conn.query("UPDATE password_reset SET used_at = NOW() WHERE auth_id = ? AND used_at IS NULL", [authId]);
}

module.exports = {
  findAuthByEmail,
  findAuthById,
  existsEmail,
  existsIdentifier,
  createAuth,
  updatePassword,
  deleteAuth,
  createUser,
  findProfile,
  updateUser,
  searchByIdentifier,
  findLikedSubjects,
  replaceLikedSubjects,
  countOwnedRooms,
  createPasswordReset,
  findValidPasswordReset,
  usePasswordResets,
};
