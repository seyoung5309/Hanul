async function includeHTML() {
  const elements = document.querySelectorAll("[data-include]");

  await Promise.all(
    Array.from(elements).map(async (element) => {
      const path = element.dataset.include;
      const response = await fetch(path);
      element.innerHTML = await response.text();
    }),
  );

  // 모든 include가 끝난 뒤 딱 한 번 실행
  activateCurrentNavIcon();
}

function activateCurrentNavIcon() {
  const currentKey = document.body.dataset.page;
  if (!currentKey) return;

  document.querySelectorAll("nav [data-key]").forEach((link) => {
    if (link.dataset.key === currentKey) {
      link.querySelector(".icon")?.classList.add("active");
    }
  });
}

includeHTML();
