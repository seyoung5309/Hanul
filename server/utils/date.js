const KST = 9 * 60 * 60 * 1000;
const DAY = 24 * 60 * 60 * 1000;

// 한국 시간(KST) 기준으로 계산
function kstNow() {
  const now = new Date(Date.now() + KST);
  return {
    year: now.getUTCFullYear(),
    month: now.getUTCMonth() + 1,
    day: now.getUTCDate(),
  };
}

// 3월을 기준으로 학년도 계산
function currentSchoolYear() {
  const { year, month } = kstNow();
  return month >= 3 ? year : year - 1;
}

// start~end 구간을 KST 자정 기준으로 날짜와 초로 반환
// 예: 23:30~01:00 → [{ date: "2026-09-27", seconds: 1800 }, { date: "2026-09-28", seconds: 3600 }]
function splitByKstDate(start, end) {
  let result = [];
  let check = start.getTime();
  const endMs = end.getTime();

  while (check < endMs) {
    let kst = check + KST;
    let nextMidnight = Math.floor(kst / DAY) * DAY + DAY - KST;
    let segmentEnd = Math.min(nextMidnight, endMs);
    let seconds = Math.round((segmentEnd - check) / 1000);

    if (seconds > 0)
      result.push({ date: new Date(kst).toISOString().slice(0, 10), seconds });
    check = segmentEnd;
  }

  return result;
}

// 알림 문구용: "10월 1일 14:30" (0시 정각이면 날짜만)
function formatKst(date) {
  const kst = new Date(date.getTime() + KST);
  const day = `${kst.getUTCMonth() + 1}월 ${kst.getUTCDate()}일`;
  const hh = kst.getUTCHours();
  const mm = kst.getUTCMinutes();

  if (hh == 0 && mm == 0) {
    return day;
  }

  return `${day} ${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

module.exports = { kstNow, currentSchoolYear, splitByKstDate, formatKst };
