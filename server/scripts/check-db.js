// DB 연결 확인: npm run db:check
const pool = require("../config/db");

async function main() {
  const [[info]] = await pool.query(
    "SELECT VERSION() AS version, DATABASE() AS db, @@time_zone AS timeZone, NOW() AS now",
  );
  const [[ssl]] = await pool.query("SHOW SESSION STATUS LIKE 'Ssl_cipher'");
  const [tables] = await pool.query("SHOW TABLES");

  console.log(`연결 성공: MySQL ${info.version}, DB=${info.db}`);
  console.log(`SSL: ${ssl.Value || "사용 안 함"}`);
  console.log(`DB 시간대: ${info.timeZone}, 현재 시각: ${info.now}`);
  console.log(`테이블 ${tables.length}개`);
}

main()
  .catch((err) => {
    console.error(`연결 실패: ${err.code || ""} ${err.message}`);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
