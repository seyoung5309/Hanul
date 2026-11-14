const studyModel = require("../models/studyModel");
const statsModel = require("../models/statsModel");
const userModel = require("../models/userModel");
const { check, isDate, isIntBetween } = require("../utils/validate");
const { currentSchoolYear } = require("../utils/date");

const SCOPES = ["student", "class"];
const DEFAULT_RANKING_LIMIT = 10;
const MAX_RANKING_LIMIT = 50;

// 교사라면 학년이 없어서 체크 해야 함.
let toStudentNumber = ({ grade, classNo, number }) => {
  return grade ? `${grade}${classNo}${String(number).padStart(2, "0")}` : null;
};

// 공부중인 방 (새로고침 후 공부 중인지 복구)
async function getCurrent(req, res) {
  let session = await studyModel.findActiveSession(req.user.id);
  let roomIds = session ? await studyModel.findSessionRoomIds(session.id) : [];
  res.json({ session, roomIds });
}

// 공부 중인 시간에 대하여 불러오기
async function getSummary(req, res) {
  res.json(await statsModel.findSummary(req.user.id));
}

// 상태 불러오기 (공부 중인지 아닌지)
async function getStats(req, res) {
  let from = req.query.from || null;
  let to = req.query.to || null;

  check(
    (from === null || isDate(from)) && (to == null || isDate(to)),
    "from, to는 YYYY-MM-DD 형식입니다.",
  );

  let [daily, subjects] = await Promise.all([
    statsModel.findDaily(req.user.id, { from, to }),
    statsModel.findSubjectTotals(req.user.id, { from, to }),
  ]);

  res.json({ daily, subjects });
}

// 랭킹 불러오기 ((랭킹 보기를 끈 사람(hide_ranking_view)에게는 목록을 주지 않음.
async function getRanking(req, res) {
  let scope = req.query.scope ?? "student";
  let period = req.query.period ?? "week";
  let limit =
    req.query.limit === undefined
      ? DEFAULT_RANKING_LIMIT
      : Number(req.query.limit);

  check(SCOPES.includes(scope), "scope는 student 또는 class입니다.");

  check(
    statsModel.PERIODS.includes(period),
    "period는 day, week, month, all 중 하나입니다.",
  );

  check(
    isIntBetween(limit, 1, MAX_RANKING_LIMIT),
    `limit은 1~${MAX_RANKING_LIMIT}입니다.`,
  );

  let userId = req.user.id;
  let year = currentSchoolYear();
  let profile = await userModel.findProfile(userId);

  if (scope == "student") {
    let [ranking, seconds] = await Promise.all([
      statsModel.findStudentRanking(period, year),
      statsModel.findUserSeconds(userId, period),
    ]);

    let me = {
      rank: ranking.find((row) => row.userId === userId)?.rank ?? null,
      seconds,
    };

    let items = ranking
      .slice(0, limit)
      .map(({ grade, classNo, number, ...row }) => ({
        ...row,
        studentNumber: toStudentNumber({ grade, classNo, number }),
      }));

    return res.json({
      scope,
      period,
      hidden: Boolean(profile?.hideRankingView),
      items: profile?.hideRankingView ? [] : items,
      me,
    });
  }

  let [ranking, classId] = await Promise.all([
    statsModel.findClassRanking(period, year),
    statsModel.findClassId(userId, year),
  ]);

  let mine = ranking.find((row) => row.classId == classId);
  let me =
    classId == null
      ? null
      : { rank: mine?.rank ?? null, seconds: mine?.seconds ?? 0 };

  res.json({
    scope,
    period,
    hidden: Boolean(profile?.hideRankingView),
    items: profile?.hideRankingView ? [] : ranking.slice(0, limit),
    me,
  });
}

// 내 랭킹 순위 및 시간
async function getMyRanking(req, res) {
  let userId = req.user.id;
  let year = currentSchoolYear();
  let [rankings, best] = await Promise.all([
    Promise.all(
      statsModel.PERIODS.map((period) =>
        statsModel.findStudentRanking(period, year),
      ),
    ),
    statsModel.findBestRanks(userId),
  ]);

  let current = Object.fromEntries(
    statsModel.PERIODS.map((period, i) => [
      period,
      rankings[i].find((row) => row.userId == userId)?.rank ?? null,
    ]),
  );

  res.json({ current, best });
}

module.exports = { getCurrent, getSummary, getStats, getRanking, getMyRanking };
