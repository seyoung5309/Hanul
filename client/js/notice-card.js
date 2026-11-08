// "읽지 않은 알림" 카드 (main, study-room 공통). api.js 다음에 불러온다.
//   채팅 탭: 안 읽은 채팅이 있는 방 (CL-003, SR-011)
//   공지사항 탭: 읽지 않은 알림 전체 - 공지, 공부방 초대, 일정 (NT-001~003)
Hanul.initNoticeCard = (socket) => {
  const { api, el, roomLink } = Hanul;
  const card = document.querySelector(".card.notice");
  if (!card) return;

  const [chatChip, noticeChip] = card.querySelectorAll(".chip");
  const list = card.querySelector(".list");
  const TYPE_LABELS = { notice: "공지사항", schedule: "일정", study_room: "공부방" };
  let tab = noticeChip.classList.contains("chip--active") ? "notice" : "chat";

  function formatDate(value) {
    const d = new Date(value);
    return `${d.getMonth() + 1}월 ${d.getDate()}일 ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  }

  function item(title, sub, onClick) {
    const text = el("div", "item-text");
    text.append(el("p", "item-title", title), el("p", "item-sub", sub));
    const li = el("li", "list__item");
    li.append(text);
    if (onClick) {
      li.style.cursor = "pointer";
      li.addEventListener("click", onClick);
    }
    return li;
  }

  function showEmpty(message) {
    list.replaceChildren(item(message, ""));
  }

  // NT-003: 알림을 누르면 읽음 처리 후 관련 화면으로
  async function openNotification(n) {
    await api("PATCH", `/notifications/${n.id}/read`);

    if (n.targetType === "room_invite") {
      await answerInvite(n);
    } else if (n.targetType === "study_room") {
      location.href = roomLink(n.targetId);
      return;
    } else if (n.targetType === "schedule" || n.targetType === "todo") {
      location.href = "main.html"; // 일정·To Do 화면이 생기면 그쪽으로
      return;
    } else {
      alert(`${n.title}\n\n${n.descript}`); // 공지는 내용을 보여준다.
    }
    await refresh();
  }

  async function answerInvite(n) {
    let accept;
    if (confirm(`${n.descript}\n\n초대를 수락할까요?`)) accept = true;
    else if (confirm("초대를 거절할까요? (취소하면 나중에 다시 볼 수 있습니다)")) accept = false;
    else return;

    try {
      const { roomId } = await api("PATCH", `/rooms/invites/${n.targetId}`, { accept });
      if (accept) location.href = roomLink(roomId);
    } catch (err) {
      alert(err.message); // 이미 응답했거나 방이 삭제된 경우
    }
  }

  async function renderChatTab(rooms) {
    const unreadRooms = rooms.filter((room) => room.unreadCount > 0);
    if (unreadRooms.length === 0) return showEmpty("안 읽은 채팅이 없습니다.");
    list.replaceChildren(...unreadRooms.map((room) =>
      item(room.title, `안 읽은 채팅 ${room.unreadCount}개`, () => (location.href = roomLink(room.id)))));
  }

  async function renderNoticeTab() {
    const { notifications } = await api("GET", "/notifications?unread=true");
    if (notifications.length === 0) return showEmpty("읽지 않은 알림이 없습니다.");
    list.replaceChildren(...notifications.map((n) =>
      item(n.title, `${TYPE_LABELS[n.type]} · ${formatDate(n.createdAt)}`, () =>
        openNotification(n).catch((err) => alert(err.message)))));
  }

  // 탭 이름 옆에 개수 표시 (NT-002)
  async function refresh() {
    const [rooms, counts] = await Promise.all([api("GET", "/rooms"), api("GET", "/notifications/unread-count")]);
    const chatCount = rooms.reduce((sum, room) => sum + room.unreadCount, 0);
    chatChip.textContent = chatCount > 0 ? `채팅 ${chatCount}` : "채팅";
    noticeChip.textContent = counts.total > 0 ? `공지사항 ${counts.total}` : "공지사항";

    chatChip.classList.toggle("chip--active", tab === "chat");
    noticeChip.classList.toggle("chip--active", tab === "notice");
    if (tab === "chat") await renderChatTab(rooms);
    else await renderNoticeTab();
  }

  chatChip.addEventListener("click", () => {
    tab = "chat";
    refresh().catch((err) => console.error(err));
  });
  noticeChip.addEventListener("click", () => {
    tab = "notice";
    refresh().catch((err) => console.error(err));
  });

  // 새 알림·새 채팅이 오면 바로 갱신
  socket.on("notification:new", () => refresh().catch((err) => console.error(err)));
  socket.on("chat:notify", () => refresh().catch((err) => console.error(err)));

  refresh().catch((err) => console.error(err));
};
