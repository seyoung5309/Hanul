// 메인: 프로필 카드, 내가 참여한 스터디룸
(() => {
  const { api, formatHMS, el, roomLink, fillProfileCard } = Hanul;
  const MAX_JOINED = 5;

  function renderJoinedRooms(rooms) {
    const list = document.querySelector(".joined__list");
    list.replaceChildren();

    if (rooms.length === 0) {
      const item = el("li", "list__item");
      item.append(el("p", "item-sub", "참여한 스터디룸이 없습니다."));
      list.append(item);
      return;
    }

    for (const room of rooms) {
      const text = el("div", "item-text");
      text.append(el("p", "item-title", room.title), el("p", "item-sub", room.comment ?? ""));

      const time = el("div", "joined__time");
      time.append(el("p", "item-sub", "총합 공부 시간"), el("p", "joined__num", formatHMS(room.totalSeconds)));

      const link = el("a", "joined__item");
      link.href = roomLink(room.id);
      link.append(text, time);

      const item = el("li", "list__item");
      item.append(link);
      list.append(item);
    }
  }

  async function init() {
    const [me, rooms] = await Promise.all([api("GET", "/users/me"), api("GET", "/rooms")]);
    fillProfileCard(me);
    renderJoinedRooms(rooms.filter((room) => room.type === "custom").slice(0, MAX_JOINED));
    Hanul.initNoticeCard(io()); // 읽지 않은 알림 카드 + 실시간 갱신
  }

  init().catch((err) => console.error(err));
})();
