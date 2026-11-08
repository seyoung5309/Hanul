// 환경설정: 프로필 사진·이름·아이디, 학생 정보, 비밀번호, 알림 설정, 로그아웃·탈퇴
(() => {
  const { api, uploadProfileImg } = Hanul;
  const $ = (selector) => document.querySelector(selector);

  function showMsg(key, text, ok = false) {
    const msg = $(`[data-msg="${key}"]`);
    msg.textContent = text;
    msg.classList.toggle("settings__msg--ok", ok);
  }

  // ----- 왼쪽 메뉴: 누른 항목을 굵게 -----
  document.querySelectorAll(".settings__menu-item").forEach((item) => {
    item.addEventListener("click", () => {
      document.querySelectorAll(".settings__menu-item").forEach((other) => {
        other.classList.toggle("settings__menu-item--active", other === item);
      });
    });
  });

  // ----- 프로필 사진 (Cloudinary) -----
  const avatar = $(".avatar-upload");
  const avatarInput = $(".avatar-upload__input");

  function showImg(url) {
    avatar.style.backgroundImage = url ? `url("${url}")` : "";
    avatar.classList.toggle("avatar-upload--has-img", Boolean(url));
  }

  avatarInput.addEventListener("change", async () => {
    const file = avatarInput.files[0];
    avatarInput.value = ""; // 같은 파일을 다시 골라도 change가 일어나도록
    if (!file) return;

    showMsg("profile", "");
    avatar.classList.add("avatar-upload--loading");
    try {
      showImg(await uploadProfileImg(file));
    } catch (err) {
      showMsg("profile", err.message);
    } finally {
      avatar.classList.remove("avatar-upload--loading");
    }
  });

  // ----- 이름·아이디: 연필을 누르면 고칠 수 있고, 다시 누르거나 Enter면 저장 -----
  const accountInputs = [...document.querySelectorAll(".edit-box__input")];
  let saved = {};

  async function saveAccount() {
    const body = Object.fromEntries(accountInputs.map((input) => [input.name, input.value.trim()]));
    if (body.name === saved.name && body.identifier === saved.identifier) return endEdit();
    try {
      await api("PATCH", "/users/me/account", body);
      saved = body;
      endEdit();
      showMsg("profile", "이름과 아이디를 바꿨습니다.", true);
    } catch (err) {
      showMsg("profile", err.message);
    }
  }

  function endEdit() {
    accountInputs.forEach((input) => {
      input.value = saved[input.name];
      input.readOnly = true;
    });
  }

  document.querySelectorAll(".edit-box__btn").forEach((button, index) => {
    button.addEventListener("click", () => {
      if (accountInputs[0].readOnly) {
        showMsg("profile", "");
        accountInputs.forEach((input) => (input.readOnly = false));
        accountInputs[index].focus();
      } else {
        saveAccount();
      }
    });
  });
  accountInputs.forEach((input) => {
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") saveAccount();
      if (event.key === "Escape") endEdit();
    });
  });

  // ----- 학생 정보: 학번을 입력하면 학년/반/번호가 채워지고, 칸을 벗어나면 저장 -----
  const yearInput = $('[name="admissionYear"]');
  const numberInput = $('[name="studentNumber"]');
  let savedClass = {};

  function fillClassBoxes(studentNumber) {
    const valid = /^\d{4}$/.test(studentNumber);
    $('[name="grade"]').value = valid ? studentNumber[0] : "";
    $('[name="classNo"]').value = valid ? studentNumber[1] : "";
    $('[name="number"]').value = valid ? Number(studentNumber.slice(2)) : "";
  }

  numberInput.addEventListener("input", () => fillClassBoxes(numberInput.value.trim()));

  async function saveClass() {
    const body = { admissionYear: yearInput.value.trim(), studentNumber: numberInput.value.trim() };
    if (body.admissionYear === savedClass.admissionYear && body.studentNumber === savedClass.studentNumber) return;
    try {
      const current = await api("POST", "/users/me/class", body);
      savedClass = { admissionYear: body.admissionYear, studentNumber: current.studentNumber };
      numberInput.value = current.studentNumber;
      fillClassBoxes(current.studentNumber);
      showMsg("student", "학생 정보를 바꿨습니다.", true);
    } catch (err) {
      showMsg("student", err.message);
    }
  }

  [yearInput, numberInput].forEach((input) => {
    input.addEventListener("change", saveClass);
    input.addEventListener("keydown", (event) => event.key === "Enter" && input.blur());
  });

  // ----- 비밀번호 -----
  const passwordForm = $(".password-form");
  passwordForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const { currentPassword, newPassword, newPasswordCheck } = passwordForm.elements;
    if (newPassword.value !== newPasswordCheck.value) return showMsg("password", "새 비밀번호가 서로 다릅니다.");
    try {
      await api("PUT", "/users/me/password", { currentPassword: currentPassword.value, newPassword: newPassword.value });
      passwordForm.reset();
      showMsg("password", "비밀번호를 바꿨습니다.", true);
    } catch (err) {
      showMsg("password", err.message);
    }
  });

  // ----- 알림 설정 (NT-004) -----
  function setToggles(settings) {
    document.querySelectorAll(".toggle").forEach((toggle) => {
      toggle.setAttribute("aria-checked", String(Boolean(settings[toggle.dataset.type])));
    });
  }

  document.querySelectorAll(".toggle").forEach((toggle) => {
    toggle.addEventListener("click", async () => {
      const next = toggle.getAttribute("aria-checked") !== "true";
      toggle.setAttribute("aria-checked", String(next)); // 먼저 바꿔 보이고, 실패하면 되돌린다
      try {
        setToggles(await api("PATCH", "/notifications/settings", { [toggle.dataset.type]: next }));
        showMsg("notification", "");
      } catch (err) {
        toggle.setAttribute("aria-checked", String(!next));
        showMsg("notification", err.message);
      }
    });
  });

  // ----- 계정 -----
  $(".account-actions__logout").addEventListener("click", async () => {
    await api("POST", "/users/logout");
    location.href = "login.html";
  });

  const withdrawDialog = $(".withdraw-dialog");
  const withdrawForm = withdrawDialog.querySelector("form");
  $(".account-actions__withdraw").addEventListener("click", () => {
    withdrawForm.reset();
    showMsg("withdraw", "");
    withdrawDialog.showModal();
  });
  withdrawDialog.querySelector(".withdraw-dialog__cancel").addEventListener("click", () => withdrawDialog.close());
  withdrawForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      await api("DELETE", "/users/me", { password: withdrawForm.elements.password.value });
      location.href = "index.html";
    } catch (err) {
      showMsg("withdraw", err.message);
    }
  });

  // ----- 처음 불러오기 -----
  async function init() {
    const [me, notificationSettings] = await Promise.all([
      api("GET", "/users/me"),
      api("GET", "/notifications/settings"),
    ]);

    showImg(me.img);
    saved = { name: me.name, identifier: me.identifier };
    endEdit();

    savedClass = { admissionYear: String(me.startYear ?? ""), studentNumber: me.class?.studentNumber ?? "" };
    yearInput.value = savedClass.admissionYear;
    numberInput.value = savedClass.studentNumber;
    fillClassBoxes(savedClass.studentNumber);

    $(".edit-box__email").textContent = me.email;
    setToggles(notificationSettings);
  }

  init().catch((err) => showMsg("profile", err.message));
})();
