document.querySelectorAll("[data-include]").forEach(async (element) => {
  const path = element.dataset.include;

  const response = await fetch(path);
  element.innerHTML = await response.text();
});
