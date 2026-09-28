// 메인 달력 (main.html의 .card.calendar)
// 다른 스크립트와 이름이 겹치지 않도록 HanulCalendar 하나만 전역에 둔다.
// 일정 API가 생기면 HanulCalendar.setEvents([...])로 실제 일정을 넣는다. (TD-003)
const HanulCalendar = (() => {
  const card = document.querySelector(".card.calendar");
  if (!card) return null; // 달력이 없는 페이지에서는 아무것도 하지 않는다.

  const monthLabel = card.querySelector(".calendar__month");
  const grid = card.querySelector(".calendar__grid");
  const eventList = card.querySelector(".calendar__events");
  const [prevButton, nextButton] = card.querySelectorAll(".calendar__arrows button");

  // 일정: { title, start: "YYYY-MM-DD", end?: "YYYY-MM-DD" } (end가 없으면 하루 일정)
  // 일정 API 연동 전 예시 데이터
  let events = [
    { title: "개학식", start: "2026-08-10" },
    { title: "스기나미스고고교 교류", start: "2026-08-09", end: "2026-08-19" },
    { title: "학생회 인수인계 수련회", start: "2026-08-28" },
  ];

  const today = new Date();
  const shown = new Date(today.getFullYear(), today.getMonth(), 1); // 보고 있는 달 (항상 1일)

  // "2026-08-10" → 그날 0시 (브라우저 시간대 기준, new Date("2026-08-10")은 UTC로 해석돼 하루 밀릴 수 있음)
  function parseDate(value) {
    const [y, m, d] = value.split("-").map(Number);
    return new Date(y, m - 1, d);
  }

  const isSameDay = (a, b) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

  function dayCell(day, className) {
    const cell = document.createElement("span");
    cell.textContent = day;
    if (className) cell.className = className;
    return cell;
  }

  function renderGrid() {
    const year = shown.getFullYear();
    const month = shown.getMonth();
    // 올해가 아닌 달로 넘어가면 연도도 표시
    monthLabel.textContent = year === today.getFullYear() ? `${month + 1}월` : `${year}년 ${month + 1}월`;

    const firstDow = new Date(year, month, 1).getDay();
    const lastDate = new Date(year, month + 1, 0).getDate();
    const prevLastDate = new Date(year, month, 0).getDate();
    const cells = [];

    // 앞: 지난달 날짜
    for (let i = firstDow - 1; i >= 0; i--) cells.push(dayCell(prevLastDate - i, "other"));

    // 이번 달
    for (let day = 1; day <= lastDate; day++) {
      const date = new Date(year, month, day);
      const classes = [];
      if (date.getDay() === 0) classes.push("sun");
      if (isSameDay(date, today)) classes.push("today");
      cells.push(dayCell(day, classes.join(" ")));
    }

    // 뒤: 다음 달 날짜로 마지막 주 채우기
    const remain = (7 - (cells.length % 7)) % 7;
    for (let day = 1; day <= remain; day++) cells.push(dayCell(day, "other"));

    const weekdays = [...grid.querySelectorAll(".dow")]; // 요일 머리글은 HTML 그대로 둔다
    grid.replaceChildren(...weekdays, ...cells);
  }

  // "8월 10일", "8월 9~19일", "8월 30일~9월 2일"
  function formatRange(start, end) {
    const s = `${start.getMonth() + 1}월 ${start.getDate()}일`;
    if (!end || isSameDay(start, end)) return s;
    if (start.getMonth() === end.getMonth()) return `${start.getMonth() + 1}월 ${start.getDate()}~${end.getDate()}일`;
    return `${s}~${end.getMonth() + 1}월 ${end.getDate()}일`;
  }

  function eventItem(dateText, title) {
    const item = document.createElement("li");
    if (dateText) {
      const date = document.createElement("p");
      date.className = "date";
      date.textContent = dateText;
      item.append(date);
    }
    const name = document.createElement("p");
    name.className = "title";
    name.textContent = title; // 사용자가 입력한 제목이므로 textContent (XSS 방지)
    item.append(name);
    return item;
  }

  // 보고 있는 달에 걸친 일정만 시작일 순으로
  function renderEvents() {
    const monthStart = shown;
    const monthEnd = new Date(shown.getFullYear(), shown.getMonth() + 1, 0);

    const inMonth = events
      .map((ev) => ({ ...ev, startDate: parseDate(ev.start), endDate: parseDate(ev.end ?? ev.start) }))
      .filter((ev) => ev.startDate <= monthEnd && ev.endDate >= monthStart)
      .sort((a, b) => a.startDate - b.startDate);

    if (inMonth.length === 0) {
      eventList.replaceChildren(eventItem(null, "일정이 없습니다."));
      return;
    }
    eventList.replaceChildren(...inMonth.map((ev) => eventItem(formatRange(ev.startDate, ev.endDate), ev.title)));
  }

  function render() {
    renderGrid();
    renderEvents();
  }

  function moveMonth(delta) {
    shown.setMonth(shown.getMonth() + delta); // 항상 1일이라 31일 → 2월 같은 날짜 넘침이 없다
    render();
  }

  prevButton.addEventListener("click", () => moveMonth(-1));
  nextButton.addEventListener("click", () => moveMonth(1));
  render();

  return {
    setEvents(list) {
      events = list;
      renderEvents();
    },
  };
})();
