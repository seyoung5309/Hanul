const bcrypt = require("bcryptjs");
const userModel = require("../models/userModel");
const cloudinaryService = require("../services/cloudinaryService");
const roomModel = require("../models/roomModel");
const roomService = require("../services/roomService");
const { getIO } = require("../socket");
const classModel = require("../models/classModel");
const withTransaction = require("../utils/transaction");
const HttpError = require("../utils/httpError");
const v = require("../utils/validate");
const { currentSchoolYear } = require("../utils/date");
const { setTokenCookie, clearTokenCookie } = require("../middleware/authMiddleware");

const TERMS_VERSION = "2026-09"; // 개인정보 처리방침이 바뀌면 올린다. (NF-006)
const BCRYPT_ROUNDS = 10;
const MAX_LIKED_SUBJECTS = 5;
const VISIBILITIES = ["all", "class", "room", "private"];
const GENDERS = { male: 0, female: 1 }; // DB: 0=남, 1=여

const normalizeEmail = (email) => (typeof email === "string" ? email.trim().toLowerCase() : email);

// 어떤 값이 중복됐는지 알려주는 에러로 바꾼다.
function toDuplicateError(err) {
  if (err.code !== "ER_DUP_ENTRY") return err;
  if (err.sqlMessage.includes("auth.email")) return new HttpError(409, "이미 사용 중인 이메일입니다.");
  if (err.sqlMessage.includes("user.identifier")) return new HttpError(409, "이미 사용 중인 아이디입니다.");
  if (err.sqlMessage.includes("class_user.class_id")) return new HttpError(409, "같은 반에 이미 등록된 번호입니다.");
  return err;
}

// 학번 "2105" → 2학년 1반 5번 (UD-003)
function parseClassInput(studentNumber) {
  const parsed = v.parseStudentNumber(studentNumber);
  v.check(parsed, "학번은 학년·반·번호 4자리로 입력해 주세요. (예: 2105 → 2학년 1반 5번)");
  return parsed;
}

const toStudentNumber = ({ grade, classNo, number }) => `${grade}${classNo}${String(number).padStart(2, "0")}`;

// UD-003, UD-010: 올해 학년도 반에 소속시키고, 이전 반 메인에서 나와 새 반 메인에 참여시킨다.
// 반과 반 메인은 처음 가입하는 학생이 있을 때 만들어진다.
async function enrollClass(conn, userId, { grade, classNo, number }) {
  const year = currentSchoolYear();
  const classId = await classModel.findOrCreateClass(conn, { year, grade, classNo });
  const roomId = await classModel.findOrCreateClassRoom(conn, { classId, title: `${grade}학년 ${classNo}반` });
  await classModel.setClassUser(conn, { classId, userId, year, number });
  await classModel.leaveClassRooms(conn, userId);
  await classModel.joinRoom(conn, { userId, roomId });
}

// UD-001, UD-003: 회원가입 후 바로 로그인 상태가 된다.
// { email, password, identifier, name, studentNumber, admissionYear?, gender?, birth?, agreeTerms }
async function signup(req, res) {
  const { password, identifier, name, gender = null, agreeTerms } = req.body;
  const email = normalizeEmail(req.body.email);
  const birth = req.body.birth || null; // 생년월일은 선택 (나중에 받을 수도 있음)

  v.check(agreeTerms === true, "개인정보 수집·이용에 동의해 주세요.");
  v.check(v.isEmail(email), "이메일 형식을 확인해 주세요.");
  v.check(v.isPassword(password), "비밀번호는 8~64자로 입력해 주세요.");
  v.check(v.isIdentifier(identifier), "아이디는 영문, 숫자, _ 조합 4~16자로 입력해 주세요.");
  v.check(v.isName(name), "이름은 1~16자로 입력해 주세요.");
  v.check(birth === null || v.isDate(birth), "생년월일을 확인해 주세요.");
  v.check(gender === null || Object.hasOwn(GENDERS, gender), "성별 값을 확인해 주세요.");
  const { grade, classNo, number } = parseClassInput(req.body.studentNumber);

  // 입학년도: 보내면 그 값, 없으면 올해 학년도와 학년으로 계산
  const schoolYear = currentSchoolYear();
  const admissionYear = req.body.admissionYear === undefined || req.body.admissionYear === ""
    ? schoolYear - grade + 1
    : Number(req.body.admissionYear);
  v.check(v.isIntBetween(admissionYear, schoolYear - 6, schoolYear), "입학년도를 확인해 주세요.");

  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

  const userId = await withTransaction(async (conn) => {
    const id = await userModel.createAuth(conn, { email, passwordHash, termsVersion: TERMS_VERSION });
    await userModel.createUser(conn, {
      id,
      identifier,
      name: name.trim(),
      birth,
      gender: gender === null ? null : GENDERS[gender],
      startYear: admissionYear,
    });
    await enrollClass(conn, id, { grade, classNo, number });
    return id;
  }).catch((err) => {
    throw toDuplicateError(err);
  });

  setTokenCookie(res, { id: userId, role: "user" });
  res.status(201).json({ id: userId });
}

// UD-002: 사용 가능하면 true
async function checkDuplicate(req, res) {
  const { identifier } = req.query;
  const email = normalizeEmail(req.query.email);
  v.check(typeof email === "string" || typeof identifier === "string", "email 또는 identifier를 입력해 주세요.");

  const result = {};
  if (typeof email === "string") result.emailAvailable = !(await userModel.existsEmail(email));
  if (typeof identifier === "string") result.identifierAvailable = !(await userModel.existsIdentifier(identifier));
  res.json(result);
}

// UD-004
async function login(req, res) {
  const { password } = req.body;
  const email = normalizeEmail(req.body.email);
  v.check(typeof email === "string" && typeof password === "string", "이메일과 비밀번호를 입력해 주세요.");

  const auth = await userModel.findAuthByEmail(email);
  const matched = auth && (await bcrypt.compare(password, auth.password));
  // 이메일과 비밀번호 중 무엇이 틀렸는지 알려주지 않는다. (가입 여부 노출 방지)
  if (!matched) throw new HttpError(401, "이메일 또는 비밀번호가 올바르지 않습니다.");

  setTokenCookie(res, { id: auth.id, role: auth.role });
  res.json({ id: auth.id, role: auth.role });
}

// UD-005
function logout(req, res) {
  clearTokenCookie(res);
  res.status(204).end();
}

// UD-007
async function getMe(req, res) {
  const profile = await userModel.findProfile(req.user.id);
  if (!profile) throw new HttpError(404, "사용자를 찾을 수 없습니다.");

  const [currentClass, subjects] = await Promise.all([
    classModel.findUserClass(req.user.id, currentSchoolYear()),
    userModel.findLikedSubjects(req.user.id),
  ]);

  const genderName = Object.keys(GENDERS).find((key) => GENDERS[key] === profile.gender) ?? null;
  res.json({
    ...profile,
    gender: genderName,
    hideRanking: Boolean(profile.hideRanking),
    hideRankingView: Boolean(profile.hideRankingView),
    class: currentClass && { ...currentClass, studentNumber: toStudentNumber(currentClass) },
    subjects,
  });
}

// UD-007: 한 마디, 관심 과목 (프로필 사진은 아래 createImgUpload, updateImg)
async function updateMe(req, res) {
  const { comment, subjectIds } = req.body;
  const fields = {};

  if (comment !== undefined) {
    v.check(comment === null || (typeof comment === "string" && comment.length <= 255), "한 마디는 255자 이하로 입력해 주세요.");
    fields.comment = comment?.trim() || null;
  }
  if (subjectIds !== undefined) {
    v.check(Array.isArray(subjectIds) && subjectIds.every(Number.isInteger), "관심 과목 값을 확인해 주세요.");
    v.check(new Set(subjectIds).size === subjectIds.length, "관심 과목이 중복되었습니다.");
    v.check(subjectIds.length <= MAX_LIKED_SUBJECTS, `관심 과목은 최대 ${MAX_LIKED_SUBJECTS}개까지 선택할 수 있습니다.`);
  }

  await withTransaction(async (conn) => {
    await userModel.updateUser(req.user.id, fields, conn);
    if (subjectIds !== undefined) await userModel.replaceLikedSubjects(conn, req.user.id, subjectIds);
  });
  res.status(204).end();
}

// UD-007: 프로필 사진 업로드 준비 → 브라우저가 Cloudinary에 올릴 폼 값 (services/cloudinaryService.js 참고)
async function createImgUpload(req, res) {
  res.json(cloudinaryService.createAvatarUpload(req.user.id));
}

// UD-007: { url } 업로드한 사진을 내 프로필 사진으로 저장, null이면 사진 삭제
async function updateImg(req, res) {
  const { url } = req.body;
  v.check(url === null || cloudinaryService.isAvatarUrl(req.user.id, url), "사진 주소를 확인해 주세요.");
  await userModel.updateUser(req.user.id, { img: url });
  res.status(204).end();
}

// 설정 화면: 이름·아이디, 비밀번호는 14일에 한 번만 바꿀 수 있다.
const CHANGE_LIMIT_DAYS = 14;
function checkChangeLimit(changedAt, what) {
  if (!changedAt) return;
  const next = new Date(new Date(changedAt).getTime() + CHANGE_LIMIT_DAYS * 24 * 60 * 60 * 1000);
  if (next > new Date()) {
    const day = `${next.getMonth() + 1}월 ${next.getDate()}일`;
    throw new HttpError(409, `${what} ${CHANGE_LIMIT_DAYS}일에 한 번만 바꿀 수 있습니다. (${day}부터 가능)`);
  }
}

// 설정: { name?, identifier? } 이름·아이디 변경
async function updateAccount(req, res) {
  const profile = await userModel.findProfile(req.user.id);
  const fields = {};
  if (req.body.name !== undefined) {
    v.check(v.isName(req.body.name), "이름은 1~16자로 입력해 주세요.");
    if (req.body.name.trim() !== profile.name) fields.name = req.body.name.trim();
  }
  if (req.body.identifier !== undefined) {
    v.check(v.isIdentifier(req.body.identifier), "아이디는 영문, 숫자, _ 조합 4~16자로 입력해 주세요.");
    if (req.body.identifier !== profile.identifier) fields.identifier = req.body.identifier;
  }
  v.check(Object.keys(fields).length > 0, "바뀐 내용이 없습니다.");
  checkChangeLimit(profile.accountChangedAt, "이름과 아이디는");

  await userModel.updateUser(req.user.id, { ...fields, account_changed_at: new Date() }).catch((err) => {
    throw toDuplicateError(err);
  });
  res.status(204).end();
}

// 설정: { currentPassword, newPassword } 로그인한 상태에서 비밀번호 변경
async function changePassword(req, res) {
  const { currentPassword, newPassword } = req.body;
  v.check(typeof currentPassword === "string" && currentPassword.length > 0, "기존 비밀번호를 입력해 주세요.");
  v.check(v.isPassword(newPassword), "새 비밀번호는 8~64자로 입력해 주세요.");
  v.check(newPassword !== currentPassword, "기존 비밀번호와 다른 비밀번호를 입력해 주세요.");

  const auth = await userModel.findAuthById(req.user.id);
  if (!auth) throw new HttpError(404, "사용자를 찾을 수 없습니다.");
  if (!(await bcrypt.compare(currentPassword, auth.password))) throw new HttpError(400, "기존 비밀번호가 올바르지 않습니다.");
  checkChangeLimit(auth.passwordChangedAt, "비밀번호는");

  const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
  await withTransaction((conn) => userModel.updatePassword(conn, auth.id, passwordHash));
  res.status(204).end();
}

// UD-008: 보낸 값만 바꾼다.
async function updateVisibility(req, res) {
  const { statusVisibility, timeVisibility } = req.body;
  const fields = {};

  if (statusVisibility !== undefined) {
    v.check(VISIBILITIES.includes(statusVisibility), "공부 상태 공개 범위를 확인해 주세요.");
    fields.status_visibility = statusVisibility;
  }
  if (timeVisibility !== undefined) {
    v.check(VISIBILITIES.includes(timeVisibility), "공부 시간 공개 범위를 확인해 주세요.");
    fields.time_visibility = timeVisibility;
  }

  await userModel.updateUser(req.user.id, fields);
  res.status(204).end();
}

// ST-008: 보낸 값만 바꾼다.
async function updateRankingSetting(req, res) {
  const { hideRanking, hideRankingView } = req.body;
  const fields = {};

  if (hideRanking !== undefined) {
    v.check(v.isBoolean(hideRanking), "hideRanking은 true 또는 false여야 합니다.");
    fields.hide_ranking = hideRanking;
  }
  if (hideRankingView !== undefined) {
    v.check(v.isBoolean(hideRankingView), "hideRankingView는 true 또는 false여야 합니다.");
    fields.hide_ranking_view = hideRankingView;
  }

  await userModel.updateUser(req.user.id, fields);
  res.status(204).end();
}

// UD-010: { studentNumber } 새 학년도 반 등록 (같은 학년도에 다시 부르면 잘못 입력한 반을 고친다)
async function changeClass(req, res) {
  const classInput = parseClassInput(req.body.studentNumber);
  // 설정 화면에서 입학년도도 함께 고칠 수 있다. (보내지 않으면 그대로)
  const admissionYear = req.body.admissionYear === "" ? undefined : req.body.admissionYear;
  const schoolYear = currentSchoolYear();
  if (admissionYear !== undefined) {
    v.check(v.isIntBetween(Number(admissionYear), schoolYear - 6, schoolYear), "입학년도를 확인해 주세요.");
  }

  await withTransaction(async (conn) => {
    await enrollClass(conn, req.user.id, classInput);
    if (admissionYear !== undefined) await userModel.updateUser(req.user.id, { start_year: Number(admissionYear) }, conn);
  }).catch((err) => {
    throw toDuplicateError(err);
  });
  const current = await classModel.findUserClass(req.user.id, currentSchoolYear());
  res.json({ ...current, studentNumber: toStudentNumber(current) });
}

// UD-009: 비밀번호를 한 번 더 확인한다.
async function withdraw(req, res) {
  const { password } = req.body;
  v.check(typeof password === "string", "비밀번호를 입력해 주세요.");

  const auth = await userModel.findAuthById(req.user.id);
  if (!auth) throw new HttpError(404, "사용자를 찾을 수 없습니다.");
  if (!(await bcrypt.compare(password, auth.password))) throw new HttpError(400, "비밀번호가 올바르지 않습니다.");

  const ownedRoomsError = (count) =>
    new HttpError(409, `방장인 공부방이 ${count}개 있습니다. 방장을 넘기거나 방을 삭제한 뒤 탈퇴해 주세요.`);

  const ownedRooms = await userModel.countOwnedRooms(req.user.id);
  if (ownedRooms > 0) throw ownedRoomsError(ownedRooms);
  const rooms = await roomModel.findUserRooms(req.user.id); // 탈퇴 후 참가자 목록을 갱신할 방

  try {
    await userModel.deleteAuth(req.user.id);
  } catch (err) {
    // 확인 직후 방을 만든 경우 study_room.owner_id FK(RESTRICT)가 막는다.
    if (err.code === "ER_ROW_IS_REFERENCED_2") throw ownedRoomsError(await userModel.countOwnedRooms(req.user.id));
    throw err;
  }

  const io = getIO();
  for (const room of rooms) roomService.emitRoomUpdated(io, room.id, "left");

  clearTokenCookie(res);
  res.status(204).end();
}

module.exports = {
  signup,
  checkDuplicate,
  login,
  logout,
  getMe,
  updateMe,
  updateAccount,
  changePassword,
  createImgUpload,
  updateImg,
  updateVisibility,
  updateRankingSetting,
  changeClass,
  withdraw,
};
