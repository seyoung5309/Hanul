const mysql = require("mysql2/promise");
const { db } = require("./env");

const pool = mysql.createPool({
  ...db,
  charset: "utf8mb4",
  timezone: "+09:00",
  dateStrings: ["DATE"], // 문자열 그대로 받아서 나중에 문자열 처리
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

pool.pool.on("connection", (conn) => {
  conn.query("SET time_zone = '+09:00'");
});

module.exports = pool;
