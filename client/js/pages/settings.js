// 환경설정 > 마이페이지: 프로필 사진(Cloudinary), 이름, 아이디
(() => {
  const { api, uploadProfileImg } = Hanul;

  const $ = (selector) => document.querySelector(selector);
  const avatar = $(".avatar-upload");
  const input = $(".avatar-upload__input");
  const errorText = $(".settings__error");

  function showImg(url) {
    avatar.style.backgroundImage = url ? `url("${url}")` : "";
    avatar.classList.toggle("avatar-upload--has-img", Boolean(url));
  }

  input.addEventListener("change", async () => {
    const file = input.files[0];
    input.value = ""; // 같은 파일을 다시 골라도 change가 일어나도록
    if (!file) return;

    errorText.textContent = "";
    avatar.classList.add("avatar-upload--loading");
    try {
      showImg(await uploadProfileImg(file));
    } catch (err) {
      errorText.textContent = err.message;
    } finally {
      avatar.classList.remove("avatar-upload--loading");
    }
  });

  async function init() {
    const me = await api("GET", "/users/me");
    $(".profile-edit__name").textContent = me.name;
    $(".profile-edit__identifier").textContent = me.identifier;
    showImg(me.img);
  }

  init().catch((err) => (errorText.textContent = err.message));
})();
