// 메인: 프로필 카드, 내가 참여한 스터디룸, 달력, 다가오는 일정, To Do
(() => {
  const { api, formatHMS, el, roomLink, fillProfileCard } = Hanul;
  const MAX_JOINED = 5;
  const UPCOMING_LIMIT = 20;

  const $ = (selector) => document.querySelector(selector);
  const pad = (n) => String(n).padStart(2, "0");

  // ----- 날짜 도우미 (서버는 ISO 시각, 화면은 브라우저 시간대) -----

  // "2026.08.13" 또는 "2026.08.13 14:30" (0시 정각이면 날짜만)
  function formatDate(value) {
    const d = new Date(value);
    const day = `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())}`;
    return d.getHours() === 0 && d.getMinutes() === 0 ? day : `${day} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  // 폼 입력값 { date: "2026-08-13", time: "14:30" | "" }
  function toInputs(value) {
    const d = new Date(value);
    const time = d.getHours() === 0 && d.getMinutes() === 0 ? "" : `${pad(d.getHours())}:${pad(d.getMinutes())}`;
    return { date: HanulCalendar.toDateString(d), time };
  }

  // 이번 주 일요일 (오늘이 일요일이면 오늘)
  function endOfWeek() {
    const d = new Date();
    d.setDate(d.getDate() + ((7 - d.getDay()) % 7));
    return d;
  }

  // 더보기(⋯) + 수정/삭제 팝업. 팝업은 CSS :focus-within으로 열린다.
  function moreMenu(onEdit, onDelete) {
    const button = el("button", "more");
    button.type = "button";
    const icon = el("img");
    icon.src = "../assets/more.svg";
    icon.alt = "더보기";
    button.append(icon);

    const editButton = el("button", "popup__item");
    editButton.type = "button";
    const pen = el("img");
    pen.src = "../assets/pen.svg";
    pen.alt = "";
    editButton.append(pen, "수정하기");

    const deleteButton = el("button", "popup__item popup__item--danger", "삭제하기");
    deleteButton.type = "button";

    // 누른 뒤 포커스를 빼서 팝업을 닫는다.
    const close = () => document.activeElement?.blur();
    editButton.addEventListener("click", () => {
      close();
      onEdit();
    });
    deleteButton.addEventListener("click", () => {
      close();
      onDelete();
    });

    const popup = el("div", "popup");
    popup.append(editButton, deleteButton);
    const wrap = el("div", "more-wrap");
    wrap.append(button, popup);
    return wrap;
  }

  function emptyItem(message) {
    const item = el("li", "list__item");
    item.append(el("p", "item-sub", message));
    return item;
  }

  function showError(err) {
    alert(err.message);
  }

  // ----- 내가 참여한 스터디룸 -----

  function renderJoinedRooms(rooms) {
    const list = $(".joined__list");
    if (rooms.length === 0) return list.replaceChildren(emptyItem("참여한 스터디룸이 없습니다."));

    list.replaceChildren(...rooms.map((room) => {
      const text = el("div", "item-text");
      text.append(el("p", "item-title", room.title), el("p", "item-sub", room.comment ?? ""));

      const time = el("div", "joined__time");
      time.append(el("p", "item-sub", "총합 공부 시간"), el("p", "joined__num", formatHMS(room.totalSeconds)));

      const link = el("a", "joined__item");
      link.href = roomLink(room.id);
      link.append(text, time);

      const item = el("li", "list__item");
      item.append(link);
      return item;
    }));
  }

  // ----- 오늘의 급식 (NEIS) -----

  const MEAL_NAMES = { breakfast: "조식", lunch: "중식", dinner: "석식" };
  let meals = {};
  let mealError = null; // 불러오기 실패 안내
  let selectedMeal = null;

  // 지금 시각에 맞는 식사를 먼저 보여준다. (9시 전 조식, 14시 전 중식, 그 뒤 석식)
  function defaultMeal() {
    const hour = new Date().getHours();
    const preferred = hour < 9 ? "breakfast" : hour < 14 ? "lunch" : "dinner";
    return meals[preferred] ? preferred : Object.keys(MEAL_NAMES).find((type) => meals[type]) ?? preferred;
  }

  function renderMeal() {
    const now = new Date();
    const menu = meals[selectedMeal]?.menu ?? [];
    $(".meal__date").textContent = `${now.getMonth() + 1}월 ${now.getDate()}일 ${MEAL_NAMES[selectedMeal]}`;
    const empty = mealError ?? "급식 정보가 없습니다.";
    $(".meal__menu ul").replaceChildren(...(menu.length ? menu : [empty]).map((dish) => el("li", null, dish)));

    document.querySelectorAll(".meal .chip").forEach((chip) => {
      chip.classList.toggle("chip--active", chip.dataset.meal === selectedMeal);
    });
  }

  async function loadMeals() {
    try {
      meals = (await api("GET", "/meals")).meals;
      mealError = null;
    } catch (err) {
      meals = {};
      mealError = err.message; // 예: 급식 API 키가 설정되지 않았습니다.
    }
    selectedMeal = defaultMeal();
    renderMeal();
  }

  document.querySelectorAll(".meal .chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      selectedMeal = chip.dataset.meal;
      renderMeal();
    });
  });

  // ----- 달력 (TD-003) -----

  let calendarRequest = 0; // 달을 빠르게 넘길 때 늦게 온 이전 달 응답은 버린다

  function connectCalendar() {
    HanulCalendar.onMonthChange(async ({ from, to }) => {
      const request = ++calendarRequest;
      try {
        const schedules = await api("GET", `/schedules?from=${from}&to=${to}`);
        if (request !== calendarRequest) return;
        HanulCalendar.setEvents(schedules.map((s) => ({
          title: s.title,
          start: HanulCalendar.toDateString(new Date(s.date)),
        })));
      } catch (err) {
        console.error(err);
      }
    });
  }

  // ----- 다가오는 일정 (TD-001~003) -----

  let scheduleRange = "all"; // all | week
  const [allChip, weekChip] = document.querySelectorAll(".schedule .chip");

  async function loadSchedules() {
    const from = HanulCalendar.toDateString(new Date());
    const to = scheduleRange === "week" ? `&to=${HanulCalendar.toDateString(endOfWeek())}` : "";
    const schedules = await api("GET", `/schedules?from=${from}${to}&limit=${UPCOMING_LIMIT}`);

    allChip.classList.toggle("chip--active", scheduleRange === "all");
    weekChip.classList.toggle("chip--active", scheduleRange === "week");

    const list = $(".schedule .list");
    if (schedules.length === 0) return list.replaceChildren(emptyItem("다가오는 일정이 없습니다."));

    list.replaceChildren(...schedules.map((schedule) => {
      const text = el("div", "item-text");
      text.append(el("p", "item-title", schedule.title), el("p", "item-sub", formatDate(schedule.date)));
      if (schedule.descript) text.title = schedule.descript;

      const item = el("li", "list__item list__item--center");
      item.append(text, moreMenu(
        () => openDialog("schedule", schedule),
        () => deleteSchedule(schedule),
      ));
      return item;
    }));
  }

  async function deleteSchedule(schedule) {
    if (!confirm(`'${schedule.title}' 일정을 삭제할까요?`)) return;
    try {
      await api("DELETE", `/schedules/${schedule.id}`);
      await refreshSchedules();
    } catch (err) {
      showError(err);
    }
  }

  async function refreshSchedules() {
    await loadSchedules();
    HanulCalendar.reload();
  }

  allChip.addEventListener("click", () => {
    scheduleRange = "all";
    loadSchedules().catch(showError);
  });
  weekChip.addEventListener("click", () => {
    scheduleRange = "week";
    loadSchedules().catch(showError);
  });
  $(".schedule .link-blue").addEventListener("click", (event) => {
    event.preventDefault();
    openDialog("schedule");
  });

  // ----- To Do (TD-004~006) -----

  async function loadTodos() {
    const todos = await api("GET", "/todos");
    const list = $(".todo__list");
    if (todos.length === 0) return list.replaceChildren(emptyItem("할 일이 없습니다."));

    list.replaceChildren(...todos.map((todo) => {
      const checkbox = el("input", "checkbox");
      checkbox.type = "checkbox";
      checkbox.checked = todo.isDone;
      checkbox.setAttribute("aria-label", `${todo.title} 완료`);
      checkbox.addEventListener("change", async () => {
        try {
          await api("PATCH", `/todos/${todo.id}/done`, { isDone: checkbox.checked });
          await loadTodos(); // 완료한 할 일은 아래로
        } catch (err) {
          checkbox.checked = !checkbox.checked;
          showError(err);
        }
      });

      // 마감일 · 내용
      const sub = [todo.dueDate ? `~${formatDate(todo.dueDate)}` : null, todo.descript].filter(Boolean).join(" · ");
      const text = el("div", "item-text");
      text.append(el("p", "item-title", todo.title));
      if (sub) text.append(el("p", "item-sub item-sub--regular", sub));

      const item = el("li", "list__item todo__item");
      item.append(checkbox, text, moreMenu(
        () => openDialog("todo", todo),
        () => deleteTodo(todo),
      ));
      return item;
    }));
  }

  async function deleteTodo(todo) {
    if (!confirm(`'${todo.title}' 할 일을 삭제할까요?`)) return;
    try {
      await api("DELETE", `/todos/${todo.id}`);
      await loadTodos();
    } catch (err) {
      showError(err);
    }
  }

  $(".todo__all").addEventListener("click", async () => {
    try {
      await api("PATCH", "/todos/done-all");
      await loadTodos();
    } catch (err) {
      showError(err);
    }
  });
  $(".todo .link-blue").addEventListener("click", (event) => {
    event.preventDefault();
    openDialog("todo");
  });

  // ----- 할일·일정 추가/수정하기 창 (Figma 디자인) -----
  // 할일: 할일 + 세부 정보 / 일정: 일정 + 날짜
  // 디자인에 없는 값(할일 마감일·과목, 일정 시각·과목·내용)은 수정할 때 보내지 않아 그대로 유지된다.

  const dialog = $(".item-dialog");
  const form = dialog.querySelector("form");
  const errorText = dialog.querySelector(".item-dialog__error");
  let editing = null; // { kind: "schedule" | "todo", item? }

  function openDialog(kind, item = null) {
    editing = { kind, item };
    const isSchedule = kind === "schedule";
    const name = isSchedule ? "일정" : "할일";
    dialog.querySelector(".item-dialog__title").textContent = `${name} ${item ? "수정하기" : "추가하기"}`;
    dialog.querySelector(".item-dialog__title-label").textContent = name;
    form.elements.title.placeholder = `${name}을 입력해 주세요.`;
    dialog.querySelector(".item-dialog__field--date").hidden = !isSchedule;
    dialog.querySelector(".item-dialog__field--descript").hidden = isSchedule;
    form.elements.date.required = isSchedule;

    form.elements.title.value = item?.title ?? "";
    form.elements.date.value = isSchedule
      ? (item ? toInputs(item.date).date : HanulCalendar.toDateString(new Date()))
      : "";
    form.elements.descript.value = item?.descript ?? "";
    errorText.textContent = "";
    dialog.showModal();
    form.elements.title.focus();
  }

  dialog.querySelector(".item-dialog__cancel").addEventListener("click", () => dialog.close());

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const { kind, item } = editing;
    const { title, date, descript } = form.elements;

    let body;
    if (kind === "schedule") {
      // AI 계획처럼 시각이 있던 일정은 날짜만 바꿔도 시각을 유지한다.
      const time = item ? toInputs(item.date).time : "";
      body = { title: title.value, date: time ? `${date.value}T${time}` : date.value };
    } else {
      body = { title: title.value, descript: descript.value.trim() || null };
    }
    const base = kind === "schedule" ? "/schedules" : "/todos";

    try {
      if (item) await api("PATCH", `${base}/${item.id}`, body);
      else await api("POST", base, body);
      dialog.close();
      if (kind === "schedule") await refreshSchedules();
      else await loadTodos();
    } catch (err) {
      errorText.textContent = err.message; // 서버 검증 메시지를 창 안에 보여준다
    }
  });

  // ----- 시작 -----

  async function init() {
    const [me, rooms] = await Promise.all([api("GET", "/users/me"), api("GET", "/rooms")]);
    fillProfileCard(me);
    renderJoinedRooms(rooms.filter((room) => room.type === "custom").slice(0, MAX_JOINED));
    Hanul.initNoticeCard(io()); // 읽지 않은 알림 카드 + 실시간 갱신
    connectCalendar();
    await Promise.all([loadSchedules(), loadTodos(), loadMeals()]);
  }

  init().catch((err) => console.error(err));
})();
