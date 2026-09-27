const jwt = require("jsonwebtoken");
const { jwt: jwtConfig } = require("../config/env");
const HttpError = require("../utils/httpError");

// 토큰은 httpOnly 쿠키에 담는다. (JS에서 읽을 수 없어 XSS로 탈취되지 않음)
const TOKEN_COOKIE = "token";

// payload: { id, role }
function signToken(payload) {
  return jwt.sign(payload, jwtConfig.secret, { expiresIn: jwtConfig.expiresIn });
}

function verifyToken(token) {
  return jwt.verify(token, jwtConfig.secret);
}

// NF-001: 로그인하지 않았거나 만료된 사용자 차단
function requireAuth(req, res, next) {
  const token = req.cookies[TOKEN_COOKIE];
  if (!token) throw new HttpError(401, "로그인이 필요합니다.");

  try {
    req.user = verifyToken(token);
  } catch {
    throw new HttpError(401, "인증이 만료되었습니다. 다시 로그인해 주세요.");
  }
  next();
}

// NT-005: 관리자 전용
function requireAdmin(req, res, next) {
  if (req.user?.role !== "admin") throw new HttpError(403, "권한이 없습니다.");
  next();
}

module.exports = { TOKEN_COOKIE, signToken, verifyToken, requireAuth, requireAdmin };
