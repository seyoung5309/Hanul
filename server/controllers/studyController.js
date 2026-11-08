const studyModel = require("../models/studyModel");
const statsModel = require("../models/statsModel");
const userModel = require("../models/userModel");
const { check, isDate, isIntBetween } = require("../utils/validate");
const { currentSchoolYear } = require("../utils/date");

const SCOPES = ["student", "class"];
const DEFAULT_RANKING_LIMIT = 10;
const MAX_RANKING_LIMIT = 50;

const toStudentNumber = ({ grade, classNo, number }) =>
  grade ? `${grade}${classNo}${String(number).padStart(2, "0")}` : null;

// 새로고침 후 공부 중인지 복구 (checkDeadline이 있으면 응답 확인 창을 다시 띄운다)
async function getCurrent(req, res) {
  res.json({ session: await studyModel.findActiveSession(req.user.id) });
}

// ST-004: { today, week, month, total } 초
async function getSummary(req, res) {
  res.json(await statsModel.findSummary(req.user.id));
}

// ST-006: ?from=&to= (YYYY-MM-DD, 비우면 전체) → { daily: [{ date, seconds }], subjects: [{ subjectId, name, seconds }] }
async function getStats(req, res) {
  const from = req.query.from || null;
  const to = req.query.to || null;
  check((from === null || isDate(from)) && (to === null || isDate(to)), "from, to는 YYYY-MM-DD 형식입니다.");

  const [daily, subjects] = await Promise.all([
    statsModel.findDaily(req.user.id, { from, to }),
    statsModel.findSubjectTotals(req.user.id, { from, to }),
  ]);
  res.json({ daily, subjects });
}

// ST-005: ?scope=student|class&period=day|week|month|all&limit=10
//   → { scope, period, hidden, items: [...], me }
//   랭킹 보기를 끈 사람(hide_ranking_view)에게는 목록을 주지 않는다. (hidden: true)
async function getRanking(req, res) {
  const scope = req.query.scope ?? "student";
  const period = req.query.period ?? "week";
  const limit = req.query.limit === undefined ? DEFAULT_RANKING_LIMIT : Number(req.query.limit);
  check(SCOPES.includes(scope), "scope는 student 또는 class입니다.");
  check(statsModel.PERIODS.includes(period), "period는 day, week, month, all 중 하나입니다.");
  check(isIntBetween(limit, 1, MAX_RANKING_LIMIT), `limit은 1~${MAX_RANKING_LIMIT}입니다.`);

  const userId = req.user.id;
  const year = currentSchoolYear();
  const profile = await userModel.findProfile(userId);

  if (scope === "student") {
    const [ranking, seconds] = await Promise.all([
      statsModel.findStudentRanking(period, year),
      statsModel.findUserSeconds(userId, period),
    ]);
    const me = { rank: ranking.find((row) => row.userId === userId)?.rank ?? null, seconds };
    const items = ranking.slice(0, limit).map(({ grade, classNo, number, ...row }) => ({
      ...row,
      studentNumber: toStudentNumber({ grade, classNo, number }),
    }));
    return res.json({ scope, period, hidden: Boolean(profile?.hideRankingView), items: profile?.hideRankingView ? [] : items, me });
  }

  const [ranking, classId] = await Promise.all([
    statsModel.findClassRanking(period, year),
    statsModel.findClassId(userId, year),
  ]);
  const mine = ranking.find((row) => row.classId === classId);
  const me = classId === null ? null : { rank: mine?.rank ?? null, seconds: mine?.seconds ?? 0 };
  res.json({
    scope,
    period,
    hidden: Boolean(profile?.hideRankingView),
    items: profile?.hideRankingView ? [] : ranking.slice(0, limit),
    me,
  });
}

module.exports = { getCurrent, getSummary, getStats, getRanking };
