(function (doc, win) {
  const root = doc.documentElement;
  const header = doc.querySelector(".site-header");
  const footer = doc.querySelector(".site-footer");
  if (!header && !footer) return;

  function activeScroller() {
    const variant = root.dataset.landingVariant;
    const narrative = variant ? doc.querySelector(`[data-narrative-variant="${variant}"]`) : null;
    const page = doc.querySelector(".page");
    return narrative || page || doc.scrollingElement || root;
  }

  function scrollTop(scroller) {
    if (!scroller || scroller === win || scroller === doc || scroller === doc.body || scroller === root) {
      return win.scrollY || root.scrollTop || doc.body.scrollTop || 0;
    }
    return scroller.scrollTop || 0;
  }

  function maxScroll(scroller) {
    if (!scroller || scroller === win || scroller === doc || scroller === doc.body || scroller === root) {
      return Math.max(0, root.scrollHeight - win.innerHeight);
    }
    return Math.max(0, scroller.scrollHeight - scroller.clientHeight);
  }

  let scroller = activeScroller();
  const initialOffsets = new WeakMap();

  function effectiveScrollTop(currentScroller) {
    const top = scrollTop(currentScroller);
    if (currentScroller?.matches?.("[data-narrative-variant]")) {
      if (!initialOffsets.has(currentScroller)) initialOffsets.set(currentScroller, top);
      return Math.abs(top - initialOffsets.get(currentScroller));
    }
    return top;
  }

  function updateChrome() {
    scroller = activeScroller();
    const isScrolled = effectiveScrollTop(scroller) > 12;
    const isNarrativeEnd = scroller?.matches?.("[data-narrative-variant]") && doc.body.classList.contains("is-product-active");
    const isAtBottom = (maxScroll(scroller) > 12 && maxScroll(scroller) - scrollTop(scroller) <= 24) || isNarrativeEnd;
    header?.classList.toggle("is-scrolled", isScrolled);
    footer?.classList.toggle("is-at-bottom", isAtBottom);
    if (header) root.style.setProperty("--header-h", `${header.offsetHeight}px`);
    if (footer) root.style.setProperty("--footer-h", `${footer.offsetHeight}px`);
  }

  function scheduleChromeUpdate() {
    updateChrome();
    win.requestAnimationFrame?.(updateChrome);
  }

  function bindScroller() {
    scroller = activeScroller();
    scroller?.addEventListener?.("scroll", scheduleChromeUpdate, { passive: true });
  }

  bindScroller();
  if (doc.body && "MutationObserver" in win) {
    new MutationObserver(scheduleChromeUpdate).observe(doc.body, { attributes: true, attributeFilter: ["class"] });
  }
  win.addEventListener("scroll", scheduleChromeUpdate, { passive: true });
  win.addEventListener("resize", scheduleChromeUpdate, { passive: true });
  win.addEventListener("load", scheduleChromeUpdate, { passive: true });
  updateChrome();
})(document, window);
