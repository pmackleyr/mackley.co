(function (doc) {
  doc.querySelectorAll(".shop-popover").forEach((popover) => popover.remove());
  doc.querySelectorAll("[data-shop-menu]").forEach((menu) => {
    menu.classList.remove("is-open");
    const trigger = menu.querySelector("[data-shop-trigger]");
    if (!trigger) return;
    trigger.removeAttribute("aria-haspopup");
    trigger.removeAttribute("aria-expanded");
    trigger.removeAttribute("data-shop-trigger");
    trigger.setAttribute("href", "/product/");
  });
})(document);
