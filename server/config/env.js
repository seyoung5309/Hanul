const path = require("path");

// .env.local을 먼저 읽고, 없는 값은 .env에서 채운다.
require("dotenv").config({
  path: [path.join(__dirname, "..", ".env.local"), path.join(__dirname, "..", ".env")],
  quiet: true,
});

const required = ["DB_HOST", "DB_USER", "DB_PASSWORD", "DB_NAME", "JWT_SECRET"];
const missing = required.filter((key) => !process.env[key]);
if (missing.length > 0) {
  throw new Error(`환경변수가 없습니다: ${missing.join(", ")} (.env.example 참고)`);
}

const port = Number(process.env.PORT) || 3000;

module.exports = {
  port,
  isProd: process.env.NODE_ENV === "production",
  appUrl: process.env.APP_URL || `http://localhost:${port}`, // 메일 속 링크의 주소
  db: {
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    // AWS RDS는 SSL로 연결한다. (mysql2에 내장된 RDS 인증서 사용)
    ssl: process.env.DB_SSL === "rds" ? "Amazon RDS" : undefined,
  },
  jwt: {
    secret: process.env.JWT_SECRET,
    expiresDays: Number(process.env.JWT_EXPIRES_DAYS) || 7,
  },
  // SMTP_HOST가 없으면 메일을 보내지 않고 콘솔에 출력한다. (개발용)
  mail: {
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
    from: process.env.MAIL_FROM || process.env.SMTP_USER,
  },
  // AI 도우미 (Google Gemini). 키가 없으면 AI 기능만 503으로 응답한다.
  ai: {
    apiKey: process.env.GEMINI_API_KEY,
    model: process.env.GEMINI_MODEL || "gemini-3.1-flash-lite",
    dailyLimit: Number(process.env.AI_DAILY_LIMIT) || 20, // AI-003: 1인 하루 요청 수
    monthlyTokenLimit: Number(process.env.AI_MONTHLY_TOKEN_LIMIT) || 0, // NF-010: 전체 월 토큰 상한 (0이면 제한 없음)
  },
};
