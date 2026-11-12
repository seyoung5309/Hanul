const path = require("path");

require("dotenv").config({
  path: [
    path.join(__dirname, "..", ".env.local"),
    path.join(__dirname, "..", ".env"),
  ],
  quiet: true,
});

const required = ["DB_HOST", "DB_USER", "DB_PASSWORD", "DB_NAME", "JWT_SECRET"];
const missing = required.filter((key) => !process.env[key]);
if (missing.length > 0) {
  throw new Error(
    `환경변수가 없습니다: ${missing.join(", ")} (.env.example 참고)`,
  );
}

const port = Number(process.env.PORT) || 3000;

module.exports = {
  port,
  isProd: process.env.NODE_ENV === "production",
  appUrl: process.env.APP_URL || `http://localhost:${port}`,
  db: {
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    // rds: mysql2에 내장된 RDS 인증서로 검증, require: 암호화만
    ssl:
      process.env.DB_SSL === "rds"
        ? "Amazon RDS"
        : process.env.DB_SSL === "require"
          ? { rejectUnauthorized: false }
          : undefined,
  },

  jwt: {
    secret: process.env.JWT_SECRET,
    expiresDays: Number(process.env.JWT_EXPIRES_DAYS) || 7,
  },

  // 이메일 인증 (구현하려다가 유료여서 생략)
  mail: {
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
    from: process.env.MAIL_FROM || process.env.SMTP_USER,
  },

  // NEIS 교육정보 개방 포털 API
  nice: {
    apiKey: process.env.NICE_API_KEY,
    officeCode: process.env.NICE_OFFICE_CODE || null, // 시도교육청코드 (예: 서울 B10)
    schoolCode: process.env.NICE_SCHOOL_CODE || null, // 표준학교코드
    schoolName: process.env.NICE_SCHOOL_NAME || "미림마이스터고등학교",
  },

  // Gemini API
  ai: {
    apiKey: process.env.GEMINI_API_KEY,
    model: process.env.GEMINI_MODEL || "gemini-3.1-flash-lite",
    dailyLimit: Number(process.env.AI_DAILY_LIMIT) || 20, // AI-003: 1인 하루 요청 수
    monthlyTokenLimit: Number(process.env.AI_MONTHLY_TOKEN_LIMIT) || 0, // NF-010: 전체 월 토큰 상한 (0이면 제한 없음)
  },

  // Cloudinary
  cloudinary: {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME,
    apiKey: process.env.CLOUDINARY_API_KEY,
    apiSecret: process.env.CLOUDINARY_API_SECRET,
  },
};
