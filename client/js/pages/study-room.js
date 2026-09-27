// 스터디룸 목록: 자주 방문한 방, 내가 만든 방, 내가 참여한 방
(() => {
  const { api, formatHMS, el, roomLink, fillProfileCard } = Hanul;
  const MAX_RECENT = 2;

  function roomCard(room, { showMembers = false } = {}) {
    const text = el("div", "room-card__text");
    text.append(el("p", "room-card__name", room.title));
    if (showMembers) text.append(el("p", "room-card__sub", `인원 ${room.memberCount}/${room.maxMembers ?? "-"}`));
    text.append(el("p", "room-card__sub", room.type === "class" ? "반 메인" : room.comment ?? ""));

    const head = el("div", "room-card__head");
    head.append(text);

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

    const card = el("a", "room-card");
    card.href = roomLink(room.id);
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

  async function init() {
    const [me, rooms] = await Promise.all([api("GET", "/users/me"), api("GET", "/rooms")]);
    fillProfileCard(me);

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
    Hanul.initNoticeCard(io()); // 읽지 않은 알림 카드 + 실시간 갱신
  }

  init().catch((err) => console.error(err));
})();
