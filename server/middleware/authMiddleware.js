const jwt = require("jsonwebtoken");
const { isProd, jwt: jwtConfig } = require("../config/env");
const HttpError = require("../utils/httpError");

const TOKEN_COOKIE = "token";

function signToken(idAndRole) {
  return jwt.sign(idAndRole, jwtConfig.secret, {
    expiresIn: `${jwtConfig.expiresDays}d`, // 7d로 저장됨.
  });
}

function verifyToken(token) {
  return jwt.verify(token, jwtConfig.secret);
}

const cookieOptions = {
  httpOnly: true,
  sameSite: "lax",
  secure: isProd,
};

function setTokenCookie(res, idAndRole) {
  res.cookie(TOKEN_COOKIE, signToken(idAndRole), {
    ...cookieOptions,
    maxAge: jwtConfig.expiresDays * 24 * 60 * 60 * 1000, // 7일
  });
}

function clearTokenCookie(res) {
  res.clearCookie(TOKEN_COOKIE, cookieOptions);
}

// NF-001: 로그인하지 않았거나 만료된 사용자 차단
function requireAuth(req, res, next) {
  let token = req.cookies[TOKEN_COOKIE];

  if (!token) {
    throw new HttpError(401, "로그인이 필요합니다.");
  }

  try {
    req.user = verifyToken(token);
  } catch {
    throw new HttpError(401, "인증이 만료되었습니다. 다시 로그인해 주세요.");
  }

  next();
}

// 관리자 전용
function requireAdmin(req, res, next) {
  if (req.user?.role !== "admin") {
    throw new HttpError(403, "권한이 없습니다.");
  }

  next();
}

module.exports = {
  TOKEN_COOKIE,
  verifyToken,
  setTokenCookie,
  clearTokenCookie,
  requireAuth,
  requireAdmin,
};
