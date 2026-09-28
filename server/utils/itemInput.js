// 일정·To Do 입력 검증 공통
const { check } = require("./validate");

const MAX_TITLE_LENGTH = 100;
const MAX_DESCRIPT_LENGTH = 1000;
const MAX_SUBJECTS = 3;

function parseId(value, name) {
  const id = Number(value);
  check(Number.isInteger(id) && id > 0, `${name}를 확인해 주세요.`);
  return id;
}

function parseTitle(value) {
  const title = typeof value === "string" ? value.trim() : "";
  check(title.length >= 1 && title.length <= MAX_TITLE_LENGTH, `제목은 1~${MAX_TITLE_LENGTH}자로 입력해 주세요.`);
  return title;
}

// 비우면 null
function parseDescript(value) {
  if (value === null || value === undefined) return null;
  check(typeof value === "string" && value.length <= MAX_DESCRIPT_LENGTH, `내용은 ${MAX_DESCRIPT_LENGTH}자 이하로 입력해 주세요.`);
  return value.trim() || null;
}

function parseSubjectIds(value) {
  if (value === undefined) return [];
  check(Array.isArray(value) && value.every(Number.isInteger), "과목 값을 확인해 주세요.");
  check(new Set(value).size === value.length, "과목이 중복되었습니다.");
  check(value.length <= MAX_SUBJECTS, `과목은 최대 ${MAX_SUBJECTS}개까지 선택할 수 있습니다.`);
  return value;
}

module.exports = { parseId, parseTitle, parseDescript, parseSubjectIds };
