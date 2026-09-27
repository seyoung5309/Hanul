const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

// 서버 PC의 시간대와 상관없이 한국 시간(KST) 기준으로 계산한다.
function kstNow() {
  const now = new Date(Date.now() + KST_OFFSET_MS);
  return {
    year: now.getUTCFullYear(),
    month: now.getUTCMonth() + 1,
    day: now.getUTCDate(),
  };
}

// 학년도는 3월 1일에 바뀐다. (2027년 2월 → 2026학년도)
function currentSchoolYear() {
  const { year, month } = kstNow();
  return month >= 3 ? year : year - 1;
}

// start~end 구간을 KST 자정 기준으로 나눠 날짜별 초를 돌려준다. (NF-013)
// 예: 23:30~01:00 → [{ date: "2026-09-27", seconds: 1800 }, { date: "2026-09-28", seconds: 3600 }]
function splitByKstDate(start, end) {
  const result = [];
  let cursor = start.getTime();
  const endMs = end.getTime();

  while (cursor < endMs) {
    const kst = cursor + KST_OFFSET_MS;
    const nextMidnight = Math.floor(kst / DAY_MS) * DAY_MS + DAY_MS - KST_OFFSET_MS;
    const segmentEnd = Math.min(nextMidnight, endMs);
    const seconds = Math.round((segmentEnd - cursor) / 1000);
    if (seconds > 0) result.push({ date: new Date(kst).toISOString().slice(0, 10), seconds });
    cursor = segmentEnd;
  }
  return result;
}

module.exports = { kstNow, currentSchoolYear, splitByKstDate };
