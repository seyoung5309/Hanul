const HttpError = require("./httpError");

// false라면 400 에러
function check(question, message) {
  if (!question) {
    throw new HttpError(400, message);
  }
}

// i(대소문자 무시), g(여러 개 찾기)
// test(): 유효성 체크, exec(): 일치하면 배열 반환(0번째 인덱스는 전체 문자열)
// ()로 exec 함수 쓸 때 나눌 범위 정할 수 있음. (?:)를 앞에 넣으면 배열에 저장 X
// /^~/: ~로 시작함, /~$/: ~로 끝남
// [abc] 중에 한 글자, [^abc]가 아닌 한 글자
// [A-Za-z] 범위 지정
// /d 숫자 하나, /s 공백 하나, . 아무거나 하나, /. 그냥 점 하나
// 반복 횟수: +(1번 이상), *(0번 이상), ?(0 또는 1), {a}(a번), {a, b}(a번 이상 b번 이하)

let isEmail = (e) => {
  return (
    typeof e == "string" &&
    e.length <= 255 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)
  );
};

let isPassword = (p) => {
  return typeof p == "string" && p.length >= 8 && p.length <= 64;
};

let isIdentifier = (i) => {
  return typeof i == "string" && /^[A-Za-z0-9_]{4,16}$/.test(i);
};

let isName = (n) => {
  return typeof n == "string" && n.trim().length >= 1 && n.trim().length <= 16;
};

function isDate(d) {
  if (typeof d != "string" || !/^\d{4}-\d{2}-\d{2}$/.test(d)) {
    return false;
  }

  let d1 = new Date(`${d}T00:00:00Z`);

  return !Number.isNaN(d1.getTime()) && d1.toISOString().startsWith(d);
}

function toDateTime(d) {
  if (typeof d != "string") return null;
  const dt = /^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}):(\d{2}))?$/.exec(d.trim());

  if (!dt || !isDate(dt[1])) {
    return null;
  }

  let [, date, hh = "00", mm = "00"] = dt;

  if (Number(hh) > 23 || Number(mm) > 59) {
    return null;
  }

  return `${date} ${hh}:${mm}:00`;
}

function parseStudentNumber(s) {
  let num = /^([1-6])([1-9])(\d{2})$/.exec(String(s ?? "").trim());

  if (!num || num[3] === "00") {
    return null;
  }

  return {
    grade: Number(num[1]),
    classNo: Number(num[2]),
    number: Number(num[3]),
  };
}

let isIntBetween = (a, min, max) => {
  return Number.isInteger(a) && a >= min && a <= max;
};

let isBoolean = (a) => {
  return typeof a == "boolean";
};

module.exports = {
  check,
  isEmail,
  isPassword,
  isIdentifier,
  isName,
  isDate,
  toDateTime,
  parseStudentNumber,
  isIntBetween,
  isBoolean,
};
