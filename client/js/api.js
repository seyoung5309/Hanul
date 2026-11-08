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

    const avatar = card.querySelector(".profile__avatar");
    if (avatar && me.img) avatar.style.background = `center / cover url("${me.img}")`;
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

  // 프로필 카드 통계: 총 공부 시간, 가장 많이 공부한 과목 3개 (ST-004, ST-006)
  const MAX_TOP_SUBJECTS = 3;
  async function fillProfileStats() {
    const card = document.querySelector(".card.profile");
    if (!card) return;

    const [summary, stats] = await Promise.all([api("GET", "/study/summary"), api("GET", "/study/stats")]);
    const [h, m, s] = formatHMS(summary.total).split(":");
    card.querySelector(".profile__time").textContent = `${h}시간 ${m}분 ${s}초`;

    const tags = card.querySelector(".tags");
    const top = stats.subjects.slice(0, MAX_TOP_SUBJECTS);
    tags.replaceChildren(...top.map((subject) => el("span", "tag", subject.name)));
    if (top.length === 0) tags.replaceChildren(el("p", "label", "아직 공부 기록이 없습니다."));
  }

  // 프로필 사진 업로드: 서버에서 서명을 받아 Cloudinary에 바로 올린 뒤, 주소를 서버에 저장한다.
  // 사용: <input type="file" accept="image/*"> 의 change에서 await Hanul.uploadProfileImg(input.files[0])
  const MAX_IMG_MB = 5;
  async function uploadProfileImg(file) {
    if (!file?.type.startsWith("image/")) throw new Error("사진 파일을 선택해 주세요.");
    if (file.size > MAX_IMG_MB * 1024 * 1024) throw new Error(`사진은 ${MAX_IMG_MB}MB 이하만 올릴 수 있습니다.`);

    const { uploadUrl, fields } = await api("POST", "/users/me/img/upload");
    const form = new FormData();
    for (const [key, value] of Object.entries(fields)) form.append(key, value);
    form.append("file", file);

    const res = await fetch(uploadUrl, { method: "POST", body: form });
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error(data?.error?.message ?? "사진을 올리지 못했습니다.");

    await api("PUT", "/users/me/img", { url: data.secure_url });
    return data.secure_url;
  }

  return { api, formatHMS, el, roomLink, fillProfileCard, fillProfileStats, uploadProfileImg };
})();
