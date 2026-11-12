(function () {
  "use strict";

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const header = document.querySelector(".mk-header");
  const scenes = Array.from(document.querySelectorAll("[data-scene]"));
  const sources = window.MACKLEY_SCENE_SOURCES || {};
  const playlists = new WeakMap();
  const ratios = new Map();
  let activeScene = null;
  let timer = null;
  let generation = 0;
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

  function stopTimer() {
    window.clearTimeout(timer);
    timer = null;
    generation += 1;
  }

  // A shuffled bag plays every clip once before reshuffling, with no
  // repeated clip at the bag boundary. GIF variants themselves do not loop.
  function nextClip(scene) {
    let state = playlists.get(scene);
    if (!state) { state = { queue: [], last: null }; playlists.set(scene, state); }
    if (!state.queue.length) {
      state.queue = [...(sources[scene.dataset.scene] || [])];
      for (let i = state.queue.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [state.queue[i], state.queue[j]] = [state.queue[j], state.queue[i]];
      }
      if (state.queue.length > 1 && state.queue[0].src === state.last) {
        [state.queue[0], state.queue[1]] = [state.queue[1], state.queue[0]];
      }
    }
    const clip = state.queue.shift();
    if (clip) state.last = clip.src;
    return clip;
  }

  function clearMedia() {
    scenes.forEach((scene) => scene.querySelectorAll(".mk-scene__media img").forEach((img) => img.remove()));
  }

  function rotateScene(scene) {
    if (!scene || reducedMotion.matches || document.hidden || scene !== activeScene) return;
    const clip = nextClip(scene);
    if (!clip) return;
    const media = scene.querySelector(".mk-scene__media");
    media.querySelectorAll("img:not(.is-visible)").forEach((img) => img.remove());
    const previous = media.querySelector(".is-visible");
    const next = document.createElement("img");
    next.alt = "";
    const token = generation;
    // A fresh image element restarts a cached single-play GIF reliably.
    next.addEventListener("load", () => {
      if (token !== generation || reducedMotion.matches || document.hidden || scene !== activeScene) { next.remove(); return; }
      window.clearTimeout(timer);
      requestAnimationFrame(() => {
        if (token !== generation) return;
        next.classList.add("is-visible");
        previous?.classList.remove("is-visible");
      });
      timer = window.setTimeout(() => rotateScene(scene), clip.durationMs);
    }, { once: true });
    next.addEventListener("error", () => {
      if (token !== generation) return;
      window.clearTimeout(timer);
      next.remove();
      timer = window.setTimeout(() => rotateScene(scene), 1000);
    }, { once: true });
    // Skip an unavailable image rather than leaving the rotation stuck.
    timer = window.setTimeout(() => { next.remove(); rotateScene(scene); }, 12000);
    media.append(next);
    next.src = clip.src;
  }

  function activate(scene) {
    if (scene === activeScene) return;
    stopTimer();
    clearMedia();
    activeScene = scene;
    rotateScene(scene);
  }

  if (scenes.length && "IntersectionObserver" in window) {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => ratios.set(entry.target, entry.intersectionRatio));
      const current = scenes.reduce((best, scene) => (ratios.get(scene) || 0) > (ratios.get(best) || 0) ? scene : best, null);
      activate(current && (ratios.get(current) || 0) >= 0.5 ? current : null);
    }, { threshold: [0, 0.25, 0.5, 0.75, 1] });
    scenes.forEach((scene) => observer.observe(scene));
  } else if (scenes.length) {
    activate(scenes[0]);
  }
  reducedMotion.addEventListener("change", () => {
    stopTimer(); clearMedia();
    if (!reducedMotion.matches) rotateScene(activeScene);
  });
  document.addEventListener("visibilitychange", () => {
    stopTimer(); clearMedia();
    if (!document.hidden) rotateScene(activeScene);
  });

  document.querySelectorAll(".mk-gallery").forEach((gallery) => {
    const track = gallery.querySelector(".mk-gallery__track");
    const prev = gallery.querySelector("[data-gallery-prev]");
    const next = gallery.querySelector("[data-gallery-next]");
    const count = gallery.querySelector("[data-gallery-count]");
    const total = track.children.length;
    let frame;
    function update() {
      const index = Math.round(track.scrollLeft / Math.max(1, track.clientWidth));
      prev.disabled = index === 0;
      next.disabled = index >= total - 1;
      count.textContent = `${index + 1} / ${total}`;
    }
    function move(direction) {
      track.scrollBy({ left: track.clientWidth * direction, behavior: reducedMotion.matches ? "instant" : "smooth" });
    }
    prev.addEventListener("click", () => move(-1));
    next.addEventListener("click", () => move(1));
    track.addEventListener("keydown", (event) => {
      if (["ArrowLeft", "ArrowRight"].includes(event.key)) {
        event.preventDefault();
        move(event.key === "ArrowRight" ? 1 : -1);
      }
    });
    track.addEventListener("scroll", () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(update);
    }, { passive: true });
    window.addEventListener("resize", update);
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
