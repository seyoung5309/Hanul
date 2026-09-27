// 서버 PC의 시간대와 상관없이 한국 시간(KST) 기준으로 계산한다.
function kstNow() {
  const now = new Date(Date.now() + 9 * 60 * 60 * 1000);
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

module.exports = { kstNow, currentSchoolYear };
