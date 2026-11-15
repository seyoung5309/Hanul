const pool = require("../config/db");

// 트랜잭션 안에서 부르는 함수는 conn을 받음.
const ROOM_COLUMNS = `id, type, class_id AS classId, title, comment, img, room_code AS roomCode,
  owner_id AS ownerId, max_members AS maxMembers, created_at AS createdAt`;

// 너, 이 방 사람 맞아?
async function isMember(userId, roomId, conn = pool) {
  const [rows] = await conn.query(
    "SELECT 1 FROM study_user WHERE user_id = ? AND room_id = ?",
    [userId, roomId],
  );
  return rows.length > 0;
}

// 참여 중인 방
async function findUserRooms(userId) {
  const [rows] = await pool.query(
    `SELECT r.id, r.type FROM study_user su JOIN study_room r ON r.id = su.room_id
     WHERE su.user_id = ?`,
    [userId],
  );
  return rows;
}

// 내 아이디가 속한 방은 어디일까요::?
async function findById(roomId, { conn = pool, forUpdate = false } = {}) {
  const [rows] = await conn.query(
    `SELECT ${ROOM_COLUMNS} FROM study_room WHERE id = ?${forUpdate ? " FOR UPDATE" : ""}`,
    [roomId],
  );
  return rows[0] ?? null;
}

// 초대 코드로 방 찾기
async function findByCode(conn, roomCode) {
  const [rows] = await conn.query(
    `SELECT ${ROOM_COLUMNS} FROM study_room WHERE room_code = ? FOR UPDATE`,
    [roomCode],
  );
  return rows[0] ?? null;
}

// 방 생성하기
async function createRoom(
  conn,
  { title, comment, roomCode, ownerId, maxMembers },
) {
  const [result] = await conn.query(
    `INSERT INTO study_room (type, title, comment, room_code, owner_id, max_members)
     VALUES ('custom', ?, ?, ?, ?, ?)`,
    [title, comment, roomCode, ownerId, maxMembers],
  );
  return result.insertId;
}

// 방 관련 과목 설정하기
async function setSubjects(conn, roomId, subjectIds) {
  if (subjectIds.length == 0) {
    return;
  }

  await conn.query("INSERT INTO subject_room (room_id, subject_id) VALUES ?", [
    subjectIds.map((subjectId) => [roomId, subjectId]),
  ]);
}

// 방에 몇 명이 있을까요?
async function countMembers(conn, roomId) {
  const [[row]] = await conn.query(
    "SELECT COUNT(*) AS count FROM study_user WHERE room_id = ?",
    [roomId],
  );
  return row.count;
}

// 반 메인을 뺀 참여 방 수
async function countJoinedCustomRooms(conn, userId) {
  const [[row]] = await conn.query(
    `SELECT COUNT(*) AS count FROM study_user su JOIN study_room r ON r.id = su.room_id
     WHERE su.user_id = ? AND r.type = 'custom'`,
    [userId],
  );
  return row.count;
}

// 참여자 추가하기
async function addMember(conn, userId, roomId) {
  await conn.query("INSERT INTO study_user (user_id, room_id) VALUES (?, ?)", [
    userId,
    roomId,
  ]);
  await touchActivity([roomId], conn);
}

// 참여자 삭제하기
async function removeMember(userId, roomId) {
  await pool.query("DELETE FROM study_user WHERE user_id = ? AND room_id = ?", [
    userId,
    roomId,
  ]);
}

// 방장 변경
async function setOwner(roomId, userId) {
  await pool.query("UPDATE study_room SET owner_id = ? WHERE id = ?", [
    userId,
    roomId,
  ]);
}

// 채팅,참가 / 기록,키워드,초대는 FK로 함께 삭제.
async function deleteRoom(roomId) {
  await pool.query("DELETE FROM study_room WHERE id = ?", [roomId]);
}

// 비활성 방 자동 삭제 기준 갱신
async function touchActivity(roomIds, conn = pool) {
  if (roomIds.length === 0) {
    return;
  }

  await conn.query(
    "UPDATE study_room SET last_active_at = NOW() WHERE id IN (?)",
    [roomIds],
  );
}

async function findInactiveRoomIds(days) {
  const [rows] = await pool.query(
    "SELECT id FROM study_room WHERE type = 'custom' AND last_active_at < NOW() - INTERVAL ? DAY",
    [days],
  );
  return rows.map((row) => row.id);
}

// 방 아이디로 사람 아이디들 찾기
async function findMemberIds(roomId) {
  const [rows] = await pool.query(
    "SELECT user_id AS userId FROM study_user WHERE room_id = ?",
    [roomId],
  );
  return rows.map((row) => row.userId);
}

// 내가 참여한 방 목록. 반 메인이 맨 위.
async function findMyRooms(userId) {
  const [rows] = await pool.query(
    `SELECT r.id, r.type, r.title, r.comment, r.img, r.room_code AS roomCode, r.owner_id AS ownerId,
            r.max_members AS maxMembers,
            (SELECT COUNT(*) FROM study_user x WHERE x.room_id = r.id) AS memberCount
     FROM study_user su JOIN study_room r ON r.id = su.room_id
     WHERE su.user_id = ?
     ORDER BY r.type = 'class' DESC, su.joined_at`,
    [userId],
  );
  return rows;
}

// 방 아이디로 과목들 찾기
async function findSubjectsByRooms(roomIds) {
  if (roomIds.length === 0) {
    return {};
  }

  const [rows] = await pool.query(
    `SELECT sr.room_id AS roomId, s.id, s.name FROM subject_room sr JOIN subject s ON s.id = sr.subject_id
     WHERE sr.room_id IN (?) ORDER BY sr.id`,
    [roomIds],
  );

  const result = Object.fromEntries(roomIds.map((id) => [id, []]));

  for (const { roomId, id, name } of rows) {
    result[roomId].push({ id, name });
  }

  return result;
}

// 방별 누적 공부 시간
async function findRoomTimes(roomIds, userId) {
  const result = Object.fromEntries(
    roomIds.map((id) => [
      id,
      { totalSeconds: 0, mySeconds: 0, activeCount: 0 },
    ]),
  );

  if (roomIds.length === 0) {
    return result;
  }

  const [rows] = await pool.query(
    `SELECT l.room_id AS roomId,
            SUM(TIMESTAMPDIFF(SECOND, l.start, COALESCE(l.end, NOW()))) AS totalSeconds,
            SUM(IF(s.user_id = ?, TIMESTAMPDIFF(SECOND, l.start, COALESCE(l.end, NOW())), 0)) AS mySeconds,
            SUM(l.status = '공부중') AS activeCount
     FROM study_log l JOIN study_session s ON s.id = l.session_id
     WHERE l.room_id IN (?)
     GROUP BY l.room_id`,
    [userId, roomIds],
  );

  // SUM 결과는 DECIMAL이라 문자열로 오므로 숫자로 바꿈.
  for (const row of rows) {
    result[row.roomId] = {
      totalSeconds: Number(row.totalSeconds),
      mySeconds: Number(row.mySeconds),
      activeCount: Number(row.activeCount),
    };
  }

  return result;
}

// 참가자 기본 정보 (반 메인이면 번호순, 아니면 들어온 순)
async function findMemberInfos(roomId) {
  const [rows] = await pool.query(
    `SELECT u.id AS userId, u.identifier, u.name, u.img, cu.number, su.joined_at AS joinedAt,
            u.status_visibility AS statusVisibility, u.time_visibility AS timeVisibility
     FROM study_user su
     JOIN user u ON u.id = su.user_id
     JOIN study_room r ON r.id = su.room_id
     LEFT JOIN class_user cu ON cu.user_id = u.id AND cu.class_id = r.class_id
     WHERE su.room_id = ?
     ORDER BY cu.number, su.joined_at`,
    [roomId],
  );
  return rows;
}

// 지금 이 방에서 공부 중인 사람 (다른 방에서 공부 중이면 여기 없음)
async function findStudyingInRoom(roomId) {
  const [rows] = await pool.query(
    `SELECT s.user_id AS userId, s.subject_id AS subjectId, s.start AS startedAt
     FROM study_log l
     JOIN study_session s ON s.id = l.session_id
     WHERE l.room_id = ? AND l.status = '공부중' AND s.status = '공부중'`,
    [roomId],
  );
  return rows;
}

// 오늘(KST) 이 방에서 공부한 시간 (어제부터 이어진 기록은 오늘 0시부터, 공부 중이면 지금까지)
async function findTodaySecondsInRoom(roomId) {
  const [rows] = await pool.query(
    `SELECT s.user_id AS userId,
            SUM(TIMESTAMPDIFF(SECOND, GREATEST(l.start, CURDATE()), COALESCE(l.end, NOW()))) AS seconds
     FROM study_log l
     JOIN study_session s ON s.id = l.session_id
     WHERE l.room_id = ? AND COALESCE(l.end, NOW()) > CURDATE()
     GROUP BY s.user_id`,
    [roomId],
  );
  return rows;
}

// 참가자와 공부 현황: 위 세 가지를 동시에 불러와 사람별로 합친다.
async function findMembers(roomId) {
  const [members, studying, today] = await Promise.all([
    findMemberInfos(roomId),
    findStudyingInRoom(roomId),
    findTodaySecondsInRoom(roomId),
  ]);

  const sessionByUser = new Map(studying.map((row) => [row.userId, row]));
  const secondsByUser = new Map(
    today.map((row) => [row.userId, Number(row.seconds)]),
  );

  return members.map((member) => {
    const session = sessionByUser.get(member.userId);
    return {
      ...member,
      studying: Boolean(session),
      subjectId: session?.subjectId ?? null,
      startedAt: session?.startedAt ?? null,
      todaySeconds: secondsByUser.get(member.userId) ?? 0,
    };
  });
}

// 초대 (디자인에 없어서 사용하는 기능X)

// 썸네일 주소 저장 (null이면 삭제)
async function updateImg(roomId, img) {
  await pool.query("UPDATE study_room SET img = ? WHERE id = ?", [img, roomId]);
}

module.exports = {
  updateImg,
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
  findRoomTimes,
  findMembers,
};
