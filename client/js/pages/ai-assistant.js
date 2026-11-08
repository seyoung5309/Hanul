// AI 도우미: 대화방 목록(기록), 학습 질문, 학습 계획 만들기·다시 만들기·저장
(() => {
  const { api, el } = Hanul;
  const $ = (selector) => document.querySelector(selector);
  const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

  const historyList = $(".history__list");
  const messages = $(".ai__messages");
  const chatForm = $(".chat__input");
  const input = chatForm.elements.message;
  const planDialog = $(".plan-dialog");
  const planForm = planDialog.querySelector("form");

  let currentRoomId = null;
  let busy = false; // AI 응답을 기다리는 중에는 새 요청을 막는다

  // ----- 화면 상태 -----

  // 대화가 없으면 안내 문구, 있으면 대화 목록을 보여준다.
  function showConversation(visible) {
    $(".ai__title").hidden = visible;
    $(".ai__info").hidden = visible;
    messages.hidden = !visible;
  }

  function scrollToBottom() {
    messages.scrollTop = messages.scrollHeight;
  }

  function bubble(role, text, extraClass = "") {
    const item = el("li", `bubble bubble--${role === "user" ? "user" : "ai"} ${extraClass}`.trim(), text);
    messages.append(item);
    scrollToBottom();
    return item;
  }

  function setBusy(value) {
    busy = value;
    input.disabled = value;
    chatForm.querySelectorAll("button").forEach((button) => (button.disabled = value));
    if (!value) input.focus();
  }

  function renderUsage(usage) {
    $(".ai__usage").textContent = `오늘 남은 AI 사용 ${usage.remaining}/${usage.limit}회`;
  }

  // ----- 기록 (AI-006) -----

  async function loadRooms() {
    const rooms = await api("GET", "/ai/rooms");

    const newButton = el("button", "history__new", "+ 새 대화");
    newButton.type = "button";
    newButton.addEventListener("click", startNewConversation);
    const newItem = el("li");
    newItem.append(newButton);

    historyList.replaceChildren(newItem, ...rooms.map((room) => {
      const open = el("button", "history__open", room.title);
      open.type = "button";
      open.title = room.title;
      open.addEventListener("click", () => openRoom(room.id).catch((err) => alert(err.message)));

      const remove = el("button", "history__delete", "×");
      remove.type = "button";
      remove.setAttribute("aria-label", `${room.title} 삭제`);
      remove.addEventListener("click", () => deleteRoom(room).catch((err) => alert(err.message)));

      const item = el("li", `history__item${room.id === currentRoomId ? " history__item--active" : ""}`);
      item.append(open, remove);
      return item;
    }));
  }

  async function openRoom(roomId) {
    const room = await api("GET", `/ai/rooms/${roomId}`);
    currentRoomId = room.id;
    messages.replaceChildren();
    for (const chat of room.chats) bubble(chat.role, chat.text);
    showConversation(true);
    scrollToBottom();
    await loadRooms();
  }

  async function deleteRoom(room) {
    if (!confirm(`'${room.title}' 대화를 삭제할까요?`)) return;
    await api("DELETE", `/ai/rooms/${room.id}`);
    if (room.id === currentRoomId) startNewConversation();
    await loadRooms();
  }

  function startNewConversation() {
    currentRoomId = null;
    messages.replaceChildren();
    showConversation(false);
    loadRooms().catch((err) => console.error(err));
    input.focus();
  }

  // ----- 질문 (AI-005) -----

  chatForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const text = input.value.trim();
    if (!text || busy) return;

    setBusy(true);
    input.value = "";
    showConversation(true);
    const mine = bubble("user", text);
    const loading = bubble("ai", "생각하는 중...", "bubble--loading");

    try {
      // 첫 질문이면 질문 앞부분을 제목으로 대화방을 만든다.
      if (!currentRoomId) currentRoomId = (await api("POST", "/ai/rooms", { title: text.slice(0, 30) })).id;
      const { aiChat, usage } = await api("POST", `/ai/rooms/${currentRoomId}/chats`, { message: text });
      loading.replaceWith(bubble("ai", aiChat.text));
      renderUsage(usage);
    } catch (err) {
      // 실패한 질문은 서버에도 남지 않으므로 화면에서도 지우고 입력창에 되돌린다.
      mine.remove();
      loading.className = "bubble bubble--ai bubble--error";
      loading.textContent = err.message;
      input.value = text;
    } finally {
      setBusy(false);
      loadRooms().catch((err) => console.error(err));
    }
  });

  // ----- 학습 계획 (AI-001, AI-002, AI-004) -----

  function dayLabel(date) {
    const [, m, d] = date.split("-").map(Number);
    return `${m}/${d}(${WEEKDAYS[new Date(`${date}T00:00:00`).getDay()]})`;
  }

  function checkItem(label, value) {
    const box = el("input");
    box.type = "checkbox";
    box.checked = true;
    box.value = value;
    const item = el("label", "plan-card__item");
    item.append(box, label);
    return item;
  }

  // 계획 답변 아래에 붙는 카드: 저장할 항목 고르기, 저장, 다시 만들기
  function planCard(roomId, plan) {
    const card = el("div", "plan-card");

    const scheduleBoxes = plan.schedules.map((s, i) =>
      checkItem(`${dayLabel(s.date)} ${s.time} ${s.title}`, `s${i}`));
    const todoBoxes = plan.todos.map((t, i) =>
      checkItem(`${t.title}${t.dueDate ? ` (~${dayLabel(t.dueDate)})` : ""}`, `t${i}`));

    if (scheduleBoxes.length) card.append(el("p", "plan-card__heading", "일정으로 저장할 공부 시간"), ...scheduleBoxes);
    if (todoBoxes.length) card.append(el("p", "plan-card__heading", "To Do로 저장할 할 일"), ...todoBoxes);

    const save = el("button", "plan-card__save", "선택한 항목 저장");
    const tight = el("button", null, "너무 빡빡해요");
    const loose = el("button", null, "너무 느슨해요");
    [save, tight, loose].forEach((button) => (button.type = "button"));

    const checked = (boxes) => boxes.map((b) => b.querySelector("input")).filter((b) => b.checked).map((b) => Number(b.value.slice(1)));

    save.addEventListener("click", async () => {
      save.disabled = true;
      try {
        const result = await api("POST", "/ai/plans/apply", {
          schedules: checked(scheduleBoxes).map((i) => plan.schedules[i]),
          todos: checked(todoBoxes).map((i) => plan.todos[i]),
        });
        save.textContent = `저장했어요 (일정 ${result.schedules}개, 할 일 ${result.todos}개)`;
      } catch (err) {
        alert(err.message);
        save.disabled = false;
      }
    });

    // AI-004: 강도를 바꿔 다시 만들기
    const regenerate = (feedback) => runPlanRequest("/ai/plans/regenerate", { roomId, plan, feedback });
    tight.addEventListener("click", () => regenerate("tight"));
    loose.addEventListener("click", () => regenerate("loose"));

    const buttons = el("div", "plan-card__buttons");
    buttons.append(save, tight, loose);
    card.append(buttons);
    return card;
  }

  async function runPlanRequest(path, body) {
    if (busy) return;
    setBusy(true);
    showConversation(true);
    const loading = bubble("ai", "학습 계획을 만드는 중...", "bubble--loading");
    try {
      const result = await api("POST", path, body);
      currentRoomId = result.roomId;
      loading.remove();
      bubble("user", result.userChat.text);
      bubble("ai", result.aiChat.text).append(planCard(result.roomId, result.plan));
      renderUsage(result.usage);
    } catch (err) {
      loading.className = "bubble bubble--ai bubble--error";
      loading.textContent = err.message;
    } finally {
      setBusy(false);
      loadRooms().catch((err) => console.error(err));
    }
  }

  $(".ai__plan-open").addEventListener("click", () => {
    planForm.reset();
    planDialog.querySelector(".plan-dialog__error").textContent = "";
    planDialog.showModal();
  });
  planDialog.querySelector(".plan-dialog__cancel").addEventListener("click", () => planDialog.close());

  planForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const { exams, availableTime, tasks } = planForm.elements;
    if (!exams.value.trim() && !availableTime.value.trim() && !tasks.value.trim()) {
      planDialog.querySelector(".plan-dialog__error").textContent = "하나 이상 입력해 주세요.";
      return;
    }
    planDialog.close();
    runPlanRequest("/ai/plans", {
      roomId: currentRoomId ?? undefined,
      exams: exams.value,
      availableTime: availableTime.value,
      tasks: tasks.value,
    });
  });

  // ----- 시작 -----

  async function init() {
    await loadRooms();
    renderUsage(await api("GET", "/ai/usage"));
  }

  init().catch((err) => console.error(err));
})();
