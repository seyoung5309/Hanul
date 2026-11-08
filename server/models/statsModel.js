const pool = require("../config/db");

// 공부 시간 통계·랭킹 (ST-004~006). 공부가 끝난 시간만 센다. (study_daily는 세션이 끝날 때 쌓인다)
// DB 세션 시간대가 KST라 CURDATE()가 한국 날짜다. (config/db.js)

// 기간 조건. d는 study_daily 별칭
const PERIOD_WHERE = {
  day: "d.date = CURDATE()",
  week: "d.date >= CURDATE() - INTERVAL WEEKDAY(CURDATE()) DAY", // 이번 주 월요일부터
  month: "d.date >= DATE_FORMAT(CURDATE(), '%Y-%m-01')",
  all: "TRUE",
};

// ST-004: 오늘·이번 주·이번 달·누적 (초)
async function findSummary(userId) {
  const [[row]] = await pool.query(
    `SELECT COALESCE(SUM(IF(${PERIOD_WHERE.day}, d.seconds, 0)), 0) AS today,
            COALESCE(SUM(IF(${PERIOD_WHERE.week}, d.seconds, 0)), 0) AS week,
            COALESCE(SUM(IF(${PERIOD_WHERE.month}, d.seconds, 0)), 0) AS month,
            COALESCE(SUM(d.seconds), 0) AS total
     FROM study_daily d WHERE d.user_id = ?`,
    [userId],
  );
  return Object.fromEntries(Object.entries(row).map(([key, value]) => [key, Number(value)]));
}

// ST-006: 날짜별 공부 시간 (from~to, 둘 다 없으면 전체)
async function findDaily(userId, { from, to }) {
  const [rows] = await pool.query(
    `SELECT date, seconds FROM study_daily
     WHERE user_id = ? AND date >= COALESCE(?, '1000-01-01') AND date <= COALESCE(?, '9999-12-31')
     ORDER BY date`,
    [userId, from, to],
  );
  return rows;
}

// ST-006: 과목별 공부 시간, 많은 순 (공부를 시작한 날짜 기준)
async function findSubjectTotals(userId, { from, to }) {
  const [rows] = await pool.query(
    `SELECT sub.id AS subjectId, sub.name, SUM(TIMESTAMPDIFF(SECOND, s.start, s.end)) AS seconds
     FROM study_session s
     JOIN subject sub ON sub.id = s.subject_id
     WHERE s.user_id = ? AND s.end IS NOT NULL
       AND DATE(s.start) >= COALESCE(?, '1000-01-01') AND DATE(s.start) <= COALESCE(?, '9999-12-31')
     GROUP BY sub.id
     HAVING seconds > 0
     ORDER BY seconds DESC, sub.id`,
    [userId, from, to],
  );
  return rows.map((row) => ({ ...row, seconds: Number(row.seconds) }));
}

// ST-005: 학생 랭킹. 랭킹 숨기기(hide_ranking)를 켠 사람은 빼고 순위를 매긴다. (동점은 같은 순위)
async function findStudentRanking(period, year) {
  const [rows] = await pool.query(
    `SELECT u.id AS userId, u.name, u.img, c.grade, c.class AS classNo, cu.number, t.seconds,
            RANK() OVER (ORDER BY t.seconds DESC) AS \`rank\`
     FROM (SELECT d.user_id, SUM(d.seconds) AS seconds FROM study_daily d
           WHERE ${PERIOD_WHERE[period]} GROUP BY d.user_id) t
     JOIN user u ON u.id = t.user_id
     LEFT JOIN class_user cu ON cu.user_id = u.id AND cu.year = ?
     LEFT JOIN class c ON c.id = cu.class_id
     WHERE u.hide_ranking = FALSE AND t.seconds > 0
     ORDER BY \`rank\`, u.id`,
    [year],
  );
  return rows.map((row) => ({ ...row, seconds: Number(row.seconds) }));
}

// ST-005: 반 랭킹. 그 학년도 반 학생들의 공부 시간 합
async function findClassRanking(period, year) {
  const [rows] = await pool.query(
    `SELECT c.id AS classId, c.grade, c.class AS classNo, SUM(d.seconds) AS seconds,
            RANK() OVER (ORDER BY SUM(d.seconds) DESC) AS \`rank\`
     FROM class c
     JOIN class_user cu ON cu.class_id = c.id
     JOIN study_daily d ON d.user_id = cu.user_id AND ${PERIOD_WHERE[period]}
     WHERE c.year = ?
     GROUP BY c.id
     HAVING seconds > 0
     ORDER BY \`rank\`, c.grade, c.class`,
    [year],
  );
  return rows.map((row) => ({ ...row, seconds: Number(row.seconds) }));
}

// 랭킹에서 빠졌어도 내 기록은 보여 주기 위한 내 공부 시간
async function findUserSeconds(userId, period) {
  const [[row]] = await pool.query(
    `SELECT COALESCE(SUM(d.seconds), 0) AS seconds FROM study_daily d
     WHERE d.user_id = ? AND ${PERIOD_WHERE[period]}`,
    [userId],
  );
  return Number(row.seconds);
}

async function findClassId(userId, year) {
  const [rows] = await pool.query("SELECT class_id AS classId FROM class_user WHERE user_id = ? AND year = ?", [
    userId,
    year,
  ]);
  return rows[0]?.classId ?? null;
}

module.exports = {
  PERIODS: Object.keys(PERIOD_WHERE),
  findSummary,
  findDaily,
  findSubjectTotals,
  findStudentRanking,
  findClassRanking,
  findUserSeconds,
  findClassId,
};
