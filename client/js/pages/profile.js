// 프로필: 사진·이름·반, 공부 통계, 완료한 할 일 수, 현재 랭킹과 최고 기록
(() => {
  const { api, formatHMS, el } = Hanul;
  const $ = (selector) => document.querySelector(selector);

  const MAX_TOP_SUBJECTS = 3;
  const PERIOD_NAMES = { day: "일간", week: "주간", month: "월간", all: "종합" };

  function rankList(selector, ranks) {
    $(selector).replaceChildren(
      ...Object.entries(PERIOD_NAMES).map(([period, name]) => el("p", null, `${name} ${ranks[period] ? `${ranks[period]}위` : "-"}`)),
    );
  }

  async function init() {
    const [me, summary, stats, doneTodos, ranking] = await Promise.all([
      api("GET", "/users/me"),
      api("GET", "/study/summary"),
      api("GET", "/study/stats"),
      api("GET", "/todos?done=true"),
      api("GET", "/study/ranking/me"),
    ]);

    if (me.img) $(".profile-head__avatar").style.backgroundImage = `url("${me.img}")`;
    $(".profile-head__name").textContent = me.name;
    $(".profile-head__class").textContent = me.class
      ? `${me.class.grade}학년 ${me.class.classNo}반 ${me.class.number}번`
      : "반 정보 없음";

    const [h, m, s] = formatHMS(summary.total).split(":");
    $(".profile-stat__time").textContent = `${h}시간 ${m}분 ${s}초`;

    const top = stats.subjects.slice(0, MAX_TOP_SUBJECTS);
    $(".tags").replaceChildren(...top.map((subject) => el("span", "tag", subject.name)));
    if (top.length === 0) $(".tags").replaceChildren(el("p", "profile-stat__label", "아직 공부 기록이 없습니다."));

    $(".profile-stat__todos").textContent = `${doneTodos.length}개의 TODO완료`;

    rankList(".profile-rank__list--current", ranking.current);
    rankList(".profile-rank__list--best", ranking.best);
  }

  init().catch((err) => console.error(err));
})();
