const mysql = require("mysql2/promise");
const { db } = require("./env");

const pool = mysql.createPool({
  ...db,
  charset: "utf8mb4",
  timezone: "+09:00", // DB에는 KST로 저장 (docs/mysql.sql 상단 참고)
  dateStrings: ["DATE"], // 생년월일 같은 DATE는 "2008-03-01" 문자열 그대로 받는다
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

// NOW()·CURDATE()도 KST로 계산되게 연결마다 세션 시간대를 맞춘다. (Railway MySQL 기본값은 UTC)
pool.pool.on("connection", (conn) => {
  conn.query("SET time_zone = '+09:00'");
});

module.exports = pool;
