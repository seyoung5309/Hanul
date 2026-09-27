const pool = require("../config/db");

// 트랜잭션 안에서 부르는 함수는 conn을 받는다. (utils/transaction.js)

const ROOM_COLUMNS = `id, type, class_id AS classId, title, comment, room_code AS roomCode,
  owner_id AS ownerId, max_members AS maxMembers, created_at AS createdAt`;

// NF-005: 방 데이터에 접근하기 전에 참가자인지 확인
async function isMember(userId, roomId, conn = pool) {
  const [rows] = await conn.query("SELECT 1 FROM study_user WHERE user_id = ? AND room_id = ?", [userId, roomId]);
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

// forUpdate: 인원 확인 후 참여처럼 동시에 바뀌면 안 되는 경우 행을 잠근다.
async function findById(roomId, { conn = pool, forUpdate = false } = {}) {
  const [rows] = await conn.query(`SELECT ${ROOM_COLUMNS} FROM study_room WHERE id = ?${forUpdate ? " FOR UPDATE" : ""}`, [
    roomId,
  ]);
  return rows[0] ?? null;
}

async function findByCode(conn, roomCode) {
  const [rows] = await conn.query(`SELECT ${ROOM_COLUMNS} FROM study_room WHERE room_code = ? FOR UPDATE`, [roomCode]);
  return rows[0] ?? null;
}

// 방 코드가 겹치면 ER_DUP_ENTRY
async function createRoom(conn, { title, comment, roomCode, ownerId, maxMembers }) {
  const [result] = await conn.query(
    `INSERT INTO study_room (type, title, comment, room_code, owner_id, max_members)
     VALUES ('custom', ?, ?, ?, ?, ?)`,
    [title, comment, roomCode, ownerId, maxMembers],
  );
  return result.insertId;
}

async function setSubjects(conn, roomId, subjectIds) {
  if (subjectIds.length === 0) return;
  await conn.query("INSERT INTO subject_room (room_id, subject_id) VALUES ?", [
    subjectIds.map((subjectId) => [roomId, subjectId]),
  ]);
}

async function countMembers(conn, roomId) {
  const [[row]] = await conn.query("SELECT COUNT(*) AS count FROM study_user WHERE room_id = ?", [roomId]);
  return row.count;
}

// 반 메인을 뺀 참여 방 수 (SR-002)
async function countJoinedCustomRooms(conn, userId) {
  const [[row]] = await conn.query(
    `SELECT COUNT(*) AS count FROM study_user su JOIN study_room r ON r.id = su.room_id
     WHERE su.user_id = ? AND r.type = 'custom'`,
    [userId],
  );
  return row.count;
}

async function addMember(conn, userId, roomId) {
  await conn.query("INSERT INTO study_user (user_id, room_id) VALUES (?, ?)", [userId, roomId]);
  await touchActivity([roomId], conn);
}

async function removeMember(userId, roomId) {
  await pool.query("DELETE FROM study_user WHERE user_id = ? AND room_id = ?", [userId, roomId]);
}

async function setOwner(roomId, userId) {
  await pool.query("UPDATE study_room SET owner_id = ? WHERE id = ?", [userId, roomId]);
}

// 채팅·참가 기록·키워드·초대는 FK로 함께 삭제된다. (SR-005)
async function deleteRoom(roomId) {
  await pool.query("DELETE FROM study_room WHERE id = ?", [roomId]);
}

// 비활성 방 자동 삭제 기준 갱신 (SR-010)
async function touchActivity(roomIds, conn = pool) {
  if (roomIds.length === 0) return;
  await conn.query("UPDATE study_room SET last_active_at = NOW() WHERE id IN (?)", [roomIds]);
}

async function findInactiveRoomIds(days) {
  const [rows] = await pool.query(
    "SELECT id FROM study_room WHERE type = 'custom' AND last_active_at < NOW() - INTERVAL ? DAY",
    [days],
  );
  return rows.map((row) => row.id);
}

async function findMemberIds(roomId) {
  const [rows] = await pool.query("SELECT user_id AS userId FROM study_user WHERE room_id = ?", [roomId]);
  return rows.map((row) => row.userId);
}

// 내가 참여한 방 목록. 반 메인이 맨 위.
async function findMyRooms(userId) {
  const [rows] = await pool.query(
    `SELECT r.id, r.type, r.title, r.comment, r.room_code AS roomCode, r.owner_id AS ownerId,
            r.max_members AS maxMembers,
            (SELECT COUNT(*) FROM study_user x WHERE x.room_id = r.id) AS memberCount
     FROM study_user su JOIN study_room r ON r.id = su.room_id
     WHERE su.user_id = ?
     ORDER BY r.type = 'class' DESC, su.joined_at`,
    [userId],
  );
  return rows;
}

// { roomId: [{ id, name }] }
async function findSubjectsByRooms(roomIds) {
  if (roomIds.length === 0) return {};
  const [rows] = await pool.query(
    `SELECT sr.room_id AS roomId, s.id, s.name FROM subject_room sr JOIN subject s ON s.id = sr.subject_id
     WHERE sr.room_id IN (?) ORDER BY sr.id`,
    [roomIds],
  );
  const result = Object.fromEntries(roomIds.map((id) => [id, []]));
  for (const { roomId, id, name } of rows) result[roomId].push({ id, name });
  return result;
}

// 참가자와 공부 현황. 공개 범위 적용은 컨트롤러에서 한다.
// todaySeconds: 오늘(KST) 이 방에서 공부한 시간 (SR-012 방별 공부 시간)
async function findMembers(roomId) {
  const [rows] = await pool.query(
    `SELECT u.id AS userId, u.identifier, u.name, u.img, cu.number, su.joined_at AS joinedAt,
            u.status_visibility AS statusVisibility, u.time_visibility AS timeVisibility,
            s.id IS NOT NULL AS studying, s.subject_id AS subjectId, s.start AS startedAt,
            COALESCE(t.seconds, 0) AS todaySeconds
     FROM study_user su
     JOIN user u ON u.id = su.user_id
     JOIN study_room r ON r.id = su.room_id
     LEFT JOIN class_user cu ON cu.user_id = u.id AND cu.class_id = r.class_id
     LEFT JOIN study_session s ON s.user_id = u.id AND s.status = '공부중'
     LEFT JOIN (
       SELECT ss.user_id,
              SUM(TIMESTAMPDIFF(SECOND, GREATEST(l.start, CURDATE()), COALESCE(l.end, NOW()))) AS seconds
       FROM study_log l JOIN study_session ss ON ss.id = l.session_id
       WHERE l.room_id = ? AND COALESCE(l.end, NOW()) > CURDATE()
       GROUP BY ss.user_id
     ) t ON t.user_id = u.id
     WHERE su.room_id = ?
     ORDER BY cu.number, su.joined_at`,
    [roomId, roomId],
  );
  return rows;
}

// ----- 초대 (room_invite) -----

// 대기 중인 초대가 이미 있으면 ER_DUP_ENTRY
async function createInvite({ roomId, inviterId, inviteeId }) {
  const [result] = await pool.query("INSERT INTO room_invite (room_id, inviter_id, invitee_id) VALUES (?, ?, ?)", [
    roomId,
    inviterId,
    inviteeId,
  ]);
  return result.insertId;
}

async function findInviteForUpdate(conn, inviteId) {
  const [rows] = await conn.query(
    `SELECT id, room_id AS roomId, invitee_id AS inviteeId, status FROM room_invite
     WHERE id = ? FOR UPDATE`,
    [inviteId],
  );
  return rows[0] ?? null;
}

async function answerInvite(conn, inviteId, status) {
  await conn.query("UPDATE room_invite SET status = ?, answered_at = NOW() WHERE id = ?", [status, inviteId]);
}

async function findPendingInvites(userId) {
  const [rows] = await pool.query(
    `SELECT i.id, i.room_id AS roomId, r.title, u.id AS inviterId, u.name AS inviterName,
            i.created_at AS createdAt
     FROM room_invite i
     JOIN study_room r ON r.id = i.room_id
     JOIN user u ON u.id = i.inviter_id
     WHERE i.invitee_id = ? AND i.status = '대기'
     ORDER BY i.id DESC`,
    [userId],
  );
  return rows;
}

module.exports = {
  isMember,
  findUserRooms,
  findById,
  findByCode,
  createRoom,
  setSubjects,
  countMembers,
  countJoinedCustomRooms,
  addMember,
  removeMember,
  setOwner,
  deleteRoom,
  touchActivity,
  findInactiveRoomIds,
  findMemberIds,
  findMyRooms,
  findSubjectsByRooms,
  findMembers,
  createInvite,
  findInviteForUpdate,
  answerInvite,
  findPendingInvites,
};
