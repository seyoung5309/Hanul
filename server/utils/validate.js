const HttpError = require("./httpError");

// 조건이 거짓이면 400 에러
function check(condition, message) {
  if (!condition) throw new HttpError(400, message);
}

const isEmail = (v) => typeof v === "string" && v.length <= 255 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

// bcrypt는 72바이트까지만 쓰므로 길이를 제한한다.
const isPassword = (v) => typeof v === "string" && v.length >= 8 && v.length <= 64;

const isIdentifier = (v) => typeof v === "string" && /^[A-Za-z0-9_]{4,16}$/.test(v);

const isName = (v) => typeof v === "string" && v.trim().length >= 1 && v.trim().length <= 16;

// "2008-03-01" 형식이고 실제 있는 날짜인지
function isDate(v) {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(v);
}

const isIntBetween = (v, min, max) => Number.isInteger(v) && v >= min && v <= max;

const isBoolean = (v) => typeof v === "boolean";

module.exports = { check, isEmail, isPassword, isIdentifier, isName, isDate, isIntBetween, isBoolean };
