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

module.exports = {
  port: Number(process.env.PORT) || 3000,
  isProd: process.env.NODE_ENV === "production",
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
    expiresIn: process.env.JWT_EXPIRES_IN || "7d",
  },
};
