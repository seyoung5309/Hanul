// 이미지 속 예시 데이터
const events = [
  { date: "8월 10일", title: "개학식" },
  { date: "8월 9~19일", title: "스기나미스고고교 교류" },
  { date: "8월 9~19일", title: "스기나미스고고교 교류" },
  { date: "8월 28일", title: "학생회 인수인계 수련회" },
];

let current = new Date(2026, 7, 1); // 8월 = index 7

function renderCalendar() {
  const year = current.getFullYear();
  const month = current.getMonth();
  document.getElementById("monthLabel").textContent = month + 1 + "월";

  const grid = document.getElementById("dateGrid");
  grid.innerHTML = "";

  const firstDay = new Date(year, month, 1).getDay();
  const lastDate = new Date(year, month + 1, 0).getDate();
  const prevLastDate = new Date(year, month, 0).getDate();

  // 이전 달 채우기
  for (let i = firstDay - 1; i >= 0; i--) {
    grid.appendChild(makeCell(prevLastDate - i, true, (firstDay - 1 - i) % 7));
  }
  // 이번 달
  for (let d = 1; d <= lastDate; d++) {
    const dow = (firstDay + d - 1) % 7;
    const cell = makeCell(d, false, dow);
    if (d === 28) cell.classList.add("selected"); // 예시: 28일 선택 상태
    grid.appendChild(cell);
  }
  // 다음 달 채우기 (7의 배수 맞추기)
  const totalCells = grid.children.length;
  const remain = (7 - (totalCells % 7)) % 7;
  for (let d = 1; d <= remain; d++) {
    grid.appendChild(makeCell(d, true, (totalCells + d - 1) % 7));
  }
}

function makeCell(day, dim, dow) {
  const cell = document.createElement("div");
  cell.className = "date-cell";
  cell.textContent = day;
  if (dim) cell.classList.add("dim");
  else if (dow === 0) cell.classList.add("sun");
  else if (dow === 6) cell.classList.add("sat");
  return cell;
}

function renderEvents() {
  const panel = document.getElementById("eventPanel");
  panel.innerHTML = "";
  events.forEach((ev) => {
    const item = document.createElement("div");
    item.className = "event-item";
    item.innerHTML = `<div class="event-date">${ev.date}</div><div class="event-title">${ev.title}</div>`;
    panel.appendChild(item);
  });
}

function changeMonth(delta) {
  current.setMonth(current.getMonth() + delta);
  renderCalendar();
}

renderCalendar();
renderEvents();
