// 서버 API 공통 함수. 페이지 스크립트보다 먼저 불러온다.
// 페이지는 서버를 통해 열어야 한다. (예: http://localhost:3000/html/main.html)
// 다른 스크립트(calendar.js 등)와 이름이 겹치지 않도록 Hanul 하나만 전역에 둔다.
const Hanul = (() => {
  const LOGIN_PAGE = "login.html";

  // 로그인 토큰은 httpOnly 쿠키라 fetch가 자동으로 보낸다.
  async function api(method, path, body) {
    const res = await fetch(`/api${path}`, {
      method,
      headers: body ? { "Content-Type": "application/json" } : {},
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = res.status === 204 ? null : await res.json().catch(() => null);

    if (res.status === 401) {
      location.href = LOGIN_PAGE;
      throw new Error(data?.message ?? "로그인이 필요합니다.");
    }
    if (!res.ok) throw new Error(data?.message ?? "요청에 실패했습니다.");
    return data;
  }

  // 3725 → "01:02:05"
  function formatHMS(totalSeconds) {
    const s = Math.max(0, Math.floor(totalSeconds));
    const pad = (n) => String(n).padStart(2, "0");
    return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
  }

  // 사용자 입력은 항상 textContent로 넣는다. (XSS 방지, NF-004)
  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
  }

  function roomLink(roomId) {
    return `room.html?id=${encodeURIComponent(roomId)}`;
  }

  // 프로필 카드 (main, study-room 공통): 이름, 반, 로그아웃
  function fillProfileCard(me) {
    const card = document.querySelector(".card.profile");
    if (!card) return;

    card.querySelector(".profile__name").textContent = me.name;
    card.querySelector(".profile__class").textContent = me.class
      ? `${me.class.grade}학년 ${me.class.classNo}반 ${me.class.number}번`
      : "반 정보 없음";

    card.querySelector(".profile__logout")?.addEventListener("click", async (event) => {
      event.preventDefault();
      await api("POST", "/users/logout");
      location.href = LOGIN_PAGE;
    });
  }

  return { api, formatHMS, el, roomLink, fillProfileCard };
})();
