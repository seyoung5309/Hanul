const mysql = require("mysql2/promise");
const { db } = require("./env");

const pool = mysql.createPool({
  ...db,
  charset: "utf8mb4",
  timezone: "+09:00", // DB에는 KST로 저장 (docs/mysql.sql 상단 참고)
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

module.exports = pool;
