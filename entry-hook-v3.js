(() => {
  const SEEN_KEY = "mackley_growth_hook_seen_v2";
  const FORCED = new URLSearchParams(window.location.search).get("growth_hook") === "1";

  if (!FORCED) {
    try {
      if (window.localStorage.getItem(SEEN_KEY)) return;
    } catch (error) {
      return;
    }
  }

  const state = {
    step: 1,
    goal: "",
    email: "",
    remainingMs: 108000
  };

  const goals = ["Breathe Better", "Clear Mind", "Sleep Deeper"];

  const overlay = document.createElement("div");
  overlay.className = "growth-hook-overlay";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-label", "Discount offer");

  const close = document.createElement("button");
  close.type = "button";
  close.className = "growth-hook-close";
  close.textContent = "x";
  close.setAttribute("aria-label", "Close");

  const card = document.createElement("section");
  card.className = "growth-hook-card";

  const brand = document.createElement("p");
  brand.className = "growth-hook-brand";
  brand.textContent = "MACKLEY";

  const timer = document.createElement("p");
  timer.className = "growth-hook-timer";

  const body = document.createElement("div");
  body.className = "growth-hook-body";

  card.append(close, brand, timer, body);
  overlay.append(card);

  let tick = 0;
  let lastTs = Date.now();

  function markSeen() {
    try {
      if (!window.localStorage.getItem(SEEN_KEY)) {
        window.localStorage.setItem(SEEN_KEY, JSON.stringify({ seenAt: new Date().toISOString() }));
      }
    } catch (error) {
      // no-op
    }
  }

  function formatTime(ms) {
    const total = Math.max(0, Math.floor(ms / 1000));
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
  }

  function refreshTimer() {
    timer.textContent = formatTime(state.remainingMs);
  }

  function startTimer() {
    refreshTimer();
    tick = window.setInterval(() => {
      const now = Date.now();
      const elapsed = now - lastTs;
      lastTs = now;
      state.remainingMs = Math.max(0, state.remainingMs - elapsed);
      refreshTimer();
    }, 250);
  }

  function stopTimer() {
    if (tick) {
      window.clearInterval(tick);
      tick = 0;
    }
  }

  function hide() {
    stopTimer();
    overlay.remove();
  }

  function sendEvent(name, payload = {}) {
    if (typeof window.gtag === "function") {
      window.gtag("event", name, payload);
    }
  }

  function stepOne() {
    const section = document.createElement("section");
    section.className = "growth-hook-step";

    const title = document.createElement("h2");
    title.textContent = "TAKE 50% OFF";

    const subtitleHead = document.createElement("h3");
    subtitleHead.textContent = "YOUR ORDER";

    const subtitle = document.createElement("p");
    subtitle.className = "growth-hook-subtitle";
    subtitle.textContent = "Pick your #1 goal to unlock discount";

    const actions = document.createElement("div");
    actions.className = "growth-hook-actions";

    goals.forEach((label) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "growth-hook-btn";
      btn.textContent = label;
      btn.addEventListener("click", () => {
        state.goal = label;
        state.step = 2;
        sendEvent("growth_hook_goal_selected", { goal: label });
        render();
      });
      actions.append(btn);
    });

    section.append(title, subtitleHead, subtitle, actions);
    return section;
  }

  function stepTwo() {
    const section = document.createElement("section");
    section.className = "growth-hook-step";

    const title = document.createElement("h2");
    title.textContent = "TAKE 50% OFF";

    const subtitleHead = document.createElement("h3");
    subtitleHead.textContent = "YOUR ORDER";

    const form = document.createElement("form");
    form.className = "growth-hook-form";

    const input = document.createElement("input");
    input.type = "email";
    input.className = "growth-hook-input";
    input.placeholder = "Your email address";
    input.required = true;
    input.autocomplete = "email";
    input.value = state.email;

    const btn = document.createElement("button");
    btn.type = "submit";
    btn.className = "growth-hook-btn";
    btn.textContent = "CLAIM DISCOUNT";

    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const value = input.value.trim();
      if (!value) return;
      state.email = value;
      stopTimer();
      timer.hidden = true;
      state.step = 3;
      sendEvent("growth_hook_email_submitted", {
        goal: state.goal,
        domain: value.split("@")[1] || ""
      });
      render();
    });

    form.append(input, btn);
    section.append(title, subtitleHead, form);
    return section;
  }

  function stepThree() {
    const section = document.createElement("section");
    section.className = "growth-hook-step";

    const title = document.createElement("h2");
    title.textContent = "YOU'RE IN!";

    const subtitle = document.createElement("p");
    subtitle.className = "growth-hook-subtitle";
    subtitle.textContent = "Check your email to receive your discount code.";

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "growth-hook-btn";
    btn.textContent = "BACK TO SITE";
    btn.addEventListener("click", () => {
      sendEvent("growth_hook_complete", {
        goal: state.goal,
        domain: state.email.split("@")[1] || ""
      });
      hide();
    });

    section.append(title, subtitle, btn);
    return section;
  }

  function render() {
    body.textContent = "";
    if (state.step === 1) body.append(stepOne());
    if (state.step === 2) body.append(stepTwo());
    if (state.step === 3) body.append(stepThree());
  }

  close.addEventListener("click", hide);

  markSeen();
  document.body.append(overlay);
  render();
  startTimer();
  sendEvent("growth_hook_viewed", { path: window.location.pathname });
})();
