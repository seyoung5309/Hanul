// 스터디룸 목록: 자주 방문한 방, 내가 만든 방, 내가 참여한 방
(() => {
  const { api, formatHMS, el, roomLink, fillProfileCard } = Hanul;
  const MAX_RECENT = 2;

  let myId = null;
  let studyingRoomIds = new Set(); // 공부 종료를 누르지 않은 세션의 방 → 이름 옆 "(공부중)"

  // ⋮ 더보기: 방장은 삭제, 참여자는 나가기 (반 메인은 나갈 수 없어 메뉴가 없다)
  function moreMenu(room) {
    const isOwner = room.ownerId === myId;
    const button = el("button", "more");
    button.type = "button";
    const icon = el("img");
    icon.src = "../assets/more.svg";
    icon.alt = "더보기";
    button.append(icon);

    const action = el("button", "popup__item popup__item--danger", isOwner ? "삭제하기" : "나가기");
    action.type = "button";
    action.addEventListener("click", async () => {
      document.activeElement?.blur();
      const question = isOwner ? `'${room.title}' 스터디룸을 삭제할까요?` : `'${room.title}' 스터디룸에서 나갈까요?`;
      if (!confirm(question)) return;
      try {
        await api("DELETE", isOwner ? `/rooms/${room.id}` : `/rooms/${room.id}/members/me`);
        await loadRooms();
      } catch (err) {
        alert(err.message);
      }
    });

    const popup = el("div", "popup");
    popup.append(action);
    const wrap = el("div", "more-wrap");
    wrap.append(button, popup);
    return wrap;
  }

  function roomCard(room, { showMembers = false } = {}) {
    const name = el("a", "room-card__name", room.title);
    name.href = roomLink(room.id);
    if (studyingRoomIds.has(room.id)) name.append(el("span", "room-card__studying", "(공부중)"));
    const text = el("div", "room-card__text");
    text.append(name);
    if (showMembers) text.append(el("p", "room-card__sub", `인원 ${room.memberCount}/${room.maxMembers ?? "-"}`));
    text.append(el("p", "room-card__sub", room.type === "class" ? "반 메인" : room.comment ?? ""));
    // 방장에게는 친구에게 알려 줄 방 코드를 보여 준다.
    if (room.roomCode && room.ownerId === myId) text.append(el("p", "room-card__sub", `방 코드 ${room.roomCode}`));

    const head = el("div", "room-card__head");
    head.append(text);
    if (room.type === "custom") head.append(moreMenu(room));

    const times = el("div", "room-card__times");
    for (const [label, seconds] of [["총합 공부 시간", room.totalSeconds], ["나의 공부 시간", room.mySeconds]]) {
      const time = el("div", "room-card__time");
      time.append(el("p", "room-card__sub", label), el("p", "room-card__num", formatHMS(seconds)));
      times.append(time);
    }

    const tags = el("div", "tags");
    for (const subject of room.subjects) tags.append(el("span", "tag", subject.name));

    const body = el("div", "room-card__body");
    body.append(head, times, tags);

    const card = el("div", "room-card");
    card.append(el("div", "room-card__thumb"), body);
    return card;
  }

  function renderSection(selector, rooms, options) {
    const grid = document.querySelector(`${selector} .room-grid`);
    grid.replaceChildren();
    if (rooms.length === 0) {
      grid.append(el("p", "room-card__sub", "스터디룸이 없습니다."));
      return;
    }
    for (const room of rooms) grid.append(roomCard(room, options));
  }

  async function loadRooms() {
    const [me, rooms, current] = await Promise.all([
      api("GET", "/users/me"),
      api("GET", "/rooms"),
      api("GET", "/study/current"),
    ]);
    myId = me.id;
    studyingRoomIds = new Set(current.roomIds);
    fillProfileCard(me);
    Hanul.fillProfileStats().catch((err) => console.error(err));

    const customRooms = rooms.filter((room) => room.type === "custom");
    // 자주 방문한 방: 내가 공부한 시간이 많은 순
    const recent = customRooms
      .filter((room) => room.mySeconds > 0)
      .sort((a, b) => b.mySeconds - a.mySeconds)
      .slice(0, MAX_RECENT);

    renderSection(".room-section--recent", recent, { showMembers: true });
    renderSection(".room-section--mine", customRooms.filter((room) => room.ownerId === me.id));
    renderSection(
      ".room-section--joined",
      rooms.filter((room) => room.ownerId !== me.id), // 반 메인 포함
    );
  }

  // ----- 스터디룸 생성하기 (SR-001) -----
  const MAX_KEYWORDS = 3;
  const MAX_MEMBERS = 30; // 디자인에 인원 칸이 없어 서버가 허용하는 최대 인원으로 만든다
  const dialog = document.querySelector(".room-dialog:not(.room-join-dialog)");
  const form = dialog.querySelector("form");
  const errorText = dialog.querySelector(".room-dialog__error");
  const chips = dialog.querySelector(".subject-chips");

  async function loadSubjectChips() {
    if (chips.childElementCount > 0) return;
    const subjects = await api("GET", "/subjects");
    chips.replaceChildren(...subjects.map((subject) => {
      const chip = el("button", "subject-chip", subject.name);
      chip.type = "button";
      chip.dataset.id = subject.id;
      chip.setAttribute("aria-pressed", "false");
      chip.addEventListener("click", () => {
        const selected = chip.getAttribute("aria-pressed") === "true";
        const count = chips.querySelectorAll('[aria-pressed="true"]').length;
        if (!selected && count >= MAX_KEYWORDS) {
          errorText.textContent = `분야는 최대 ${MAX_KEYWORDS}개까지 고를 수 있습니다.`;
          return;
        }
        errorText.textContent = "";
        chip.setAttribute("aria-pressed", String(!selected));
      });
      return chip;
    }));
  }

  document.querySelector(".room-create-open").addEventListener("click", async () => {
    form.reset();
    errorText.textContent = "";
    chips.querySelectorAll(".subject-chip").forEach((chip) => chip.setAttribute("aria-pressed", "false"));
    dialog.showModal();
    form.elements.title.focus();
    await loadSubjectChips().catch((err) => (errorText.textContent = err.message));
  });

  dialog.querySelector(".room-dialog__cancel").addEventListener("click", () => dialog.close());

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const subjectIds = [...chips.querySelectorAll('[aria-pressed="true"]')].map((chip) => Number(chip.dataset.id));
    try {
      await api("POST", "/rooms", {
        title: form.elements.title.value,
        comment: form.elements.comment.value.trim() || null,
        subjectIds,
        maxMembers: MAX_MEMBERS,
      });
      dialog.close();
      await loadRooms();
    } catch (err) {
      errorText.textContent = err.message;
    }
  });

  // ----- 스터디룸 참여하기 (SR-002): 방 코드 6자리 -----
  const joinDialog = document.querySelector(".room-join-dialog");
  const joinForm = joinDialog.querySelector("form");
  const joinError = joinDialog.querySelector(".room-dialog__error");

  document.querySelector(".room-join-open").addEventListener("click", () => {
    joinForm.reset();
    joinError.textContent = "";
    joinDialog.showModal();
    joinForm.elements.roomCode.focus();
  });

  joinDialog.querySelector(".room-dialog__cancel").addEventListener("click", () => joinDialog.close());

  joinForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      await api("POST", "/rooms/join", { roomCode: joinForm.elements.roomCode.value.trim() });
      joinDialog.close();
      await loadRooms();
    } catch (err) {
      joinError.textContent = err.message;
    }
  });

  async function init() {
    await loadRooms();
    const socket = io();
    Hanul.initNoticeCard(socket); // 읽지 않은 알림 카드 + 실시간 갱신
    // 다른 페이지에서도 공부가 이어지게 하고, 끝나면 "(공부중)"을 지운다.
    Hanul.keepStudying(socket, () => loadRooms().catch((err) => console.error(err)));
  }

  init().catch((err) => console.error(err));
})();
