(function () {
  "use strict";

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  let trackingLoaded = false;
  const preferenceKey = "mackley_optional_analytics";

  function storedPreference() {
    try { return localStorage.getItem(preferenceKey) === "allowed"; } catch (_) { return false; }
  }

  function privacySignal() {
    return navigator.globalPrivacyControl === true || navigator.doNotTrack === "1";
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = src;
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }

  async function enableTracking() {
    if (trackingLoaded || privacySignal() || !storedPreference()) return;
    if (!["mackley.co", "www.mackley.co"].includes(location.hostname)) return;
    trackingLoaded = true;
    try {
      await loadScript("/google-tag.js");
      await loadScript("https://www.googletagmanager.com/gtag/js?id=AW-18048135651");
      await loadScript("/ads.js");
    } catch (_) {
      // Navigation and checkout work even when measurement is blocked.
    }
  }

  const privacyForm = document.querySelector("[data-privacy-form]");
  if (privacyForm) {
    const input = privacyForm.elements.analytics;
    const status = privacyForm.querySelector("[data-privacy-status]");
    input.checked = storedPreference() && !privacySignal();
    input.disabled = privacySignal();
    status.textContent = privacySignal()
      ? "Your browser privacy signal keeps optional analytics off."
      : input.checked ? "Optional analytics is on in this browser." : "Optional analytics is off in this browser.";
    privacyForm.addEventListener("submit", (event) => {
      event.preventDefault();
      const allowed = input.checked && !privacySignal();
      try {
        localStorage.setItem(preferenceKey, allowed ? "allowed" : "denied");
        if (!allowed) {
          for (const area of [localStorage, sessionStorage]) {
            Object.keys(area).filter((key) => key.startsWith("mackley_analytics_") || key === "mackley_google_click_params").forEach((key) => area.removeItem(key));
          }
          for (const cookie of document.cookie.split(";")) {
            const name = cookie.split("=")[0].trim();
            if (/^(_ga|_gid|_gcl|_gat)/.test(name)) {
              document.cookie = `${name}=; Max-Age=0; Path=/; SameSite=Lax`;
              document.cookie = `${name}=; Max-Age=0; Path=/; Domain=.mackley.co; SameSite=Lax`;
            }
          }
        }
        status.textContent = allowed ? "Saved. Optional analytics is on." : "Saved. Optional analytics is off.";
        if (!allowed && trackingLoaded) location.reload();
        if (allowed) enableTracking();
      } catch (_) {
        status.textContent = "This browser could not save your choice. Optional analytics stays off.";
      }
    });
  }
  enableTracking();

  // Identical, native-swipe product carousel on home and product pages.
  document.querySelectorAll(".mk-gallery").forEach((gallery) => {
    const track = gallery.querySelector(".mk-gallery__track");
    const previous = gallery.querySelector("[data-gallery-prev]");
    const next = gallery.querySelector("[data-gallery-next]");
    const count = gallery.querySelector("[data-gallery-count]");
    const dots = Array.from(gallery.querySelectorAll("[data-gallery-slide]"));
    const total = track.children.length;
    let index = 0, frame = 0;
    const clamp = (value) => Math.max(0, Math.min(total - 1, value));
    function update() {
      index = clamp(Math.round(track.scrollLeft / Math.max(1, track.clientWidth)));
      previous.disabled = index === 0;
      next.disabled = index === total - 1;
      const label = `${index + 1} / ${total}`;
      if (count.textContent !== label) count.textContent = label;
      dots.forEach((dot, i) => {
        if (i === index) dot.setAttribute("aria-current", "true");
        else dot.removeAttribute("aria-current");
      });
    }
    function show(value, immediate = false) {
      index = clamp(value);
      track.scrollTo({ left: track.clientWidth * index, behavior: immediate || reducedMotion.matches ? "auto" : "smooth" });
    }
    previous.addEventListener("click", () => show(index - 1));
    next.addEventListener("click", () => show(index + 1));
    dots.forEach((dot, i) => dot.addEventListener("click", () => show(i)));
    track.addEventListener("keydown", (event) => {
      const destinations = { ArrowLeft: index - 1, ArrowRight: index + 1, Home: 0, End: total - 1 };
      if (event.key in destinations) { event.preventDefault(); show(destinations[event.key]); }
    });
    track.addEventListener("scroll", () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(update);
    }, { passive: true });
    if ("ResizeObserver" in window) new ResizeObserver(() => show(index, true)).observe(track);
    else window.addEventListener("resize", () => show(index, true));
    update();
  });

  // Keep the user-facing local preview current without touching production.
  if (["localhost", "127.0.0.1"].includes(location.hostname)) {
    let stamp = "";
    let running = false;
    window.setInterval(async () => {
      if (document.hidden || running) return;
      running = true;
      try {
        const urls = [location.pathname, "/styles.css", "/storefront.js"];
        const headers = await Promise.all(urls.map(async (url) => {
          const response = await fetch(url, { method: "HEAD", cache: "no-store" });
          return `${response.headers.get("last-modified")}:${response.headers.get("content-length")}`;
        }));
        const next = headers.join("|");
        if (stamp && stamp !== next) location.reload();
        stamp = next;
      } catch (_) { /* The page remains usable if the local server stops. */ }
      finally { running = false; }
    }, 1800);
  }
})();
