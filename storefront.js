(function () {
  "use strict";

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const header = document.querySelector(".mk-header");
  const scenes = Array.from(document.querySelectorAll("[data-scene]"));
  const motionButton = document.querySelector(".mk-motion");
  const sources = {
    inside: ["/public/inside/brain.gif", "/public/inside/heart.gif", "/public/inside/chamber.gif"],
    outside: ["/public/outside/surf.gif", "/public/outside/yogi.gif", "/public/outside/astronaut.gif"]
  };
  const ratios = new Map();
  let activeScene = null;
  let paused = reducedMotion.matches;
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
    if (["localhost", "127.0.0.1"].includes(location.hostname)) return;
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

  function setMotionLabel() {
    if (!motionButton) return;
    motionButton.textContent = paused ? "Play motion" : "Pause motion";
    motionButton.setAttribute("aria-pressed", String(paused));
    motionButton.hidden = !activeScene;
  }

  function rotateScene(scene) {
    if (!scene || paused || document.hidden || scene !== activeScene) return;
    const images = Array.from(scene.querySelectorAll(".mk-scene__media img"));
    const list = sources[scene.dataset.scene];
    const index = Number(scene.dataset.frame || 0);
    const next = images.find((img) => !img.classList.contains("is-visible")) || images[0];
    const token = generation;
    next.onload = () => {
      if (token !== generation || paused || scene !== activeScene) return;
      images.forEach((img) => img.classList.toggle("is-visible", img === next));
      scene.dataset.frame = String((index + 1) % list.length);
    };
    next.src = list[index % list.length];
    if (next.complete && next.naturalWidth) next.onload();
    timer = window.setTimeout(() => rotateScene(scene), 8000);
  }

  function activate(scene) {
    if (scene === activeScene) return;
    stopTimer();
    activeScene = scene;
    if (header) header.dataset.theme = scene ? "dark" : "light";
    setMotionLabel();
    scenes.filter((item) => item !== scene).forEach((item) => {
      item.querySelectorAll("img").forEach((img) => {
        img.classList.remove("is-visible");
        img.removeAttribute("src");
      });
    });
    rotateScene(scene);
  }

  if (scenes.length && "IntersectionObserver" in window) {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => ratios.set(entry.target, entry.intersectionRatio));
      const current = scenes.reduce((best, scene) => (ratios.get(scene) || 0) > (ratios.get(best) || 0) ? scene : best, null);
      activate(current && (ratios.get(current) || 0) > 0.18 ? current : null);
    }, { threshold: [0, 0.18, 0.3, 0.5, 0.7, 1] });
    scenes.forEach((scene) => observer.observe(scene));
    activate(scenes[0]);
  } else if (scenes.length) {
    activate(scenes[0]);
  }

  motionButton?.addEventListener("click", () => {
    paused = !paused;
    stopTimer();
    if (paused) {
      scenes.forEach((scene) => scene.querySelectorAll("img").forEach((img) => {
        img.classList.remove("is-visible");
        img.removeAttribute("src");
      }));
    } else {
      rotateScene(activeScene);
    }
    setMotionLabel();
  });
  reducedMotion.addEventListener("change", (event) => {
    if (event.matches && !paused) motionButton?.click();
  });
  document.addEventListener("visibilitychange", () => {
    stopTimer();
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
