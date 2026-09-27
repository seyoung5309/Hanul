// 스터디룸 내부: 방 정보, 공부 시작·종료, 실시간 공부 시간, 3시간 응답 확인, 채팅
(() => {
  const { api, formatHMS, el } = Hanul;
  const HEARTBEAT_MS = 30 * 1000;

  const roomId = Number(new URLSearchParams(location.search).get("id"));
  if (!Number.isInteger(roomId) || roomId <= 0) {
    location.href = "study-room.html";
    return;
  }

  const $ = (selector) => document.querySelector(selector);
  const subjectSelect = $(".room__subject");
  const studyButton = $(".room__study-btn");
  const checkModal = $(".study-check");

  let room = null; // GET /rooms/:roomId 결과
  let loadedAt = 0; // room을 받은 시각 (그 뒤로 흐른 시간만큼 타이머를 늘린다)
  let session = null; // 내 공부 세션 (없으면 null)
  let heartbeatTimer = null;
  let checkTimer = null;

  const socket = io();

  // 소켓 요청을 Promise로: 실패하면 서버 메시지로 에러
  function request(event, payload = {}) {
    return new Promise((resolve, reject) => {
      socket.emit(event, payload, (res) => (res.ok ? resolve(res) : reject(new Error(res.message))));
    });
  }

  async function loadRoom() {
    room = await api("GET", `/rooms/${roomId}`);
    loadedAt = Date.now();
    $(".room__title").textContent = room.title;
    document.title = `한울 - ${room.title}`;
    renderTimers();
  }

  // 1초마다: 지금 이 방에서 공부 중인 기록 수만큼 총합이 늘고, 내가 공부 중이면 내 시간도 는다.
  function renderTimers() {
    if (!room) return;
    const elapsed = (Date.now() - loadedAt) / 1000;
    $(".timer__num--total").textContent = formatHMS(room.totalSeconds + room.activeCount * elapsed);
    $(".timer__num--mine").textContent = formatHMS(room.mySeconds + (session ? elapsed : 0));
  }

  function renderStudyState() {
    studyButton.textContent = session ? "공부 종료" : "공부 시작";
    studyButton.classList.toggle("room__study-btn--stop", Boolean(session));
    subjectSelect.disabled = Boolean(session);
    if (session) subjectSelect.value = String(session.subjectId);

    clearInterval(heartbeatTimer);
    if (session) heartbeatTimer = setInterval(() => socket.emit("study:heartbeat", {}, () => {}), HEARTBEAT_MS);
  }

  function showCheck(deadline) {
    const end = new Date(deadline).getTime();
    checkModal.hidden = false;
    clearInterval(checkTimer);
    const tick = () => {
      $(".study-check__count").textContent = Math.max(0, Math.ceil((end - Date.now()) / 1000));
    };
    tick();
    checkTimer = setInterval(tick, 250);
  }

  function hideCheck() {
    checkModal.hidden = true;
    clearInterval(checkTimer);
  }

  async function loadSubjects() {
    const subjects = await api("GET", "/subjects");
    subjectSelect.replaceChildren(...subjects.map((s) => {
      const option = el("option", null, s.name);
      option.value = s.id;
      return option;
    }));
  }

  // ----- 채팅 (CL-002, CL-003, SR-004) -----
  const chatList = $(".chat__messages");
  const chatForm = $(".chat__form");
  let oldestChatId = null; // 위로 스크롤할 때 이 id 이전을 불러온다
  let hasMoreChats = false;
  let loadingChats = false;
  let lastReadSent = 0;

  function formatChatTime(time) {
    const d = new Date(time);
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  function chatItem(chat) {
    const meta = el("p", "message__meta");
    meta.append(el("span", null, chat.name), el("span", null, formatChatTime(chat.time)));
    const body = el("div", "message__body");
    body.append(meta, el("p", "message__text", chat.message)); // textContent로 출력 (XSS 방지)

    const item = el("li", "message");
    item.dataset.id = chat.id;
    item.append(el("div", "message__avatar"), body);
    return item;
  }

  const isNearBottom = () => chatList.scrollHeight - chatList.scrollTop - chatList.clientHeight < 80;
  const scrollToBottom = () => (chatList.scrollTop = chatList.scrollHeight);

  // 화면을 보고 있을 때만 읽음 처리 (다른 탭에 있으면 돌아왔을 때 처리)
  function markRead(chatId) {
    if (document.hidden || chatId <= lastReadSent) return;
    lastReadSent = chatId;
    api("PUT", `/rooms/${roomId}/chats/read`, { chatId }).catch((err) => console.error(err));
  }

  async function loadChats({ reset = false } = {}) {
    if (loadingChats) return;
    loadingChats = true;
    try {
      if (reset) {
        oldestChatId = null;
        chatList.replaceChildren();
      }
      const query = oldestChatId ? `?before=${oldestChatId}` : "";
      const { chats, hasMore } = await api("GET", `/rooms/${roomId}/chats${query}`);
      hasMoreChats = hasMore;
      if (chats.length === 0) return;

      const isFirstPage = oldestChatId === null;
      const previousHeight = chatList.scrollHeight;
      chatList.prepend(...chats.map(chatItem));
      oldestChatId = chats[0].id;

      if (isFirstPage) {
        scrollToBottom();
        markRead(chats.at(-1).id);
      } else {
        chatList.scrollTop += chatList.scrollHeight - previousHeight; // 보던 위치 유지
      }
    } finally {
      loadingChats = false;
    }
    // 채팅이 화면을 다 채우지 못하면 스크롤이 생기지 않으므로 이전 기록을 이어서 불러온다.
    if (hasMoreChats && chatList.scrollHeight <= chatList.clientHeight) await loadChats();
  }

  chatList.addEventListener("scroll", () => {
    if (chatList.scrollTop < 40 && hasMoreChats) loadChats().catch((err) => console.error(err));
  });

  document.addEventListener("visibilitychange", () => {
    const last = chatList.lastElementChild;
    if (last) markRead(Number(last.dataset.id));
  });

  chatForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const input = chatForm.elements.message;
    const message = input.value.trim();
    if (!message) return;

    try {
      await request("chat:send", { roomId, message });
      input.value = "";
      scrollToBottom();
    } catch (err) {
      alert(err.message);
    }
    input.focus();
  });

  socket.on("chat:new", (chat) => {
    if (chat.roomId !== roomId) return;
    const stick = isNearBottom();
    chatList.append(chatItem(chat));
    if (stick) scrollToBottom();
    markRead(chat.id);
  });

  // ----- 이벤트 -----

  studyButton.addEventListener("click", async () => {
    studyButton.disabled = true;
    try {
      if (session) await request("study:stop");
      else await request("study:start", { subjectId: Number(subjectSelect.value) });
    } catch (err) {
      alert(err.message);
    } finally {
      studyButton.disabled = false;
    }
  });

  $(".study-check__btn").addEventListener("click", async () => {
    try {
      await request("study:confirm");
      hideCheck();
    } catch (err) {
      alert(err.message);
    }
  });

  // 연결(재연결 포함)될 때마다 방에 다시 들어간다.
  // 재연결이면 끊긴 동안 놓친 채팅이 있을 수 있어 채팅을 다시 불러온다.
  let connectedBefore = false;
  socket.on("connect", async () => {
    try {
      await request("room:enter", { roomId });
      if (connectedBefore) await loadChats({ reset: true });
      connectedBefore = true;
    } catch (err) {
      alert(err.message);
      location.href = "study-room.html";
    }
  });

  // 내 세션 변화 (다른 탭에서 시작·종료한 것도 온다)
  socket.on("study:session", async ({ session: next, reason }) => {
    session = next;
    renderStudyState();
    if (!next) hideCheck();
    if (reason === "no-response") alert("응답이 없어 공부가 종료되었습니다.");
    if (reason === "disconnected") alert("연결이 끊겨 공부가 종료되었습니다.");
    await loadRoom();
  });

  socket.on("study:check", ({ deadline }) => showCheck(deadline));

  // 누군가 이 방에서 공부를 시작·종료하거나 참가자가 바뀌면 시간을 다시 받는다.
  socket.on("study:status", ({ roomId: changed }) => changed === roomId && loadRoom());
  socket.on("room:updated", ({ roomId: changed }) => changed === roomId && loadRoom());

  socket.on("room:removed", ({ roomId: removed, reason }) => {
    if (removed !== roomId) return;
    alert(reason === "kicked" ? "방에서 내보내졌습니다." : "방이 삭제되었습니다.");
    location.href = "study-room.html";
  });

  async function init() {
    await Promise.all([loadRoom(), loadSubjects(), loadChats()]);
    ({ session } = await api("GET", "/study/current"));
    renderStudyState();
    renderTimers();
    // 새로고침 전에 확인 창이 떠 있었다면 다시 띄운다.
    if (session?.checkDeadline && new Date(session.checkDeadline) > new Date()) showCheck(session.checkDeadline);
    setInterval(renderTimers, 1000);
  }

  init().catch((err) => console.error(err));
})();
