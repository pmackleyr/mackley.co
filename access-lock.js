(() => {
  const PASSWORD = "jumpthegap";
  const ACCESS_KEY = "mackley_access_lock_v1";

  function hasAccess() {
    try {
      return window.localStorage.getItem(ACCESS_KEY) === "unlocked";
    } catch (error) {
      return false;
    }
  }

  function saveAccess(profile) {
    try {
      window.localStorage.setItem(ACCESS_KEY, "unlocked");
      window.localStorage.setItem(
        "mackley_access_profile_v1",
        JSON.stringify({ ...profile, unlockedAt: new Date().toISOString() })
      );
    } catch (error) {
      // Access still opens for browsers that block storage.
    }
  }

  function recordAccess(profile, password) {
    const payload = {
      event_id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      name: profile.name,
      email: profile.email,
      password,
      page_path: window.location.pathname,
      page_url: window.location.href,
      referrer: document.referrer,
      language: navigator.language || "",
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "",
      unlocked_at: new Date().toISOString()
    };

    fetch("https://api.mackley.co/access-entry", {
      method: "POST",
      keepalive: true,
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    }).catch(() => {});
  }

  function validEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value);
  }

  function unlock() {
    document.documentElement.classList.remove("access-lock-open");
    document.body.classList.remove("access-lock-open");
    const overlay = document.querySelector(".access-lock");
    if (overlay) overlay.remove();
  }

  function buildLock() {
    if (hasAccess()) return;

    document.documentElement.classList.add("access-lock-open");
    document.body.classList.add("access-lock-open");

    const overlay = document.createElement("main");
    overlay.className = "access-lock";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-label", "Site access");

    overlay.innerHTML = `
      <section class="access-lock__card">
        <div class="access-lock__logo" aria-hidden="true">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16">
            <path d="M2 7.5h12v5A3 3 0 0 1 11 15.5H5A3 3 0 0 1 2 12.5v-5Z" fill="currentColor"></path>
            <path d="M3 6.5A5 5 0 0 1 8 1.5a5 5 0 0 1 5 5v3a5 5 0 0 1-10 0v-3Z" fill="transparent" stroke="currentColor" stroke-width="2"></path>
          </svg>
        </div>
        <form class="access-lock__form" id="access-lock-form" novalidate>
          <label class="access-lock__description" for="access-name">
            Enter name, email, and password<br />
            to access the site.
          </label>
          <div class="access-lock__fields">
            <input class="access-lock__input" id="access-name" name="name" type="text" autocomplete="name" placeholder="Name" required />
            <input class="access-lock__input" id="access-email" name="email" type="email" autocomplete="email" placeholder="Email" required />
            <input class="access-lock__input access-lock__input--password" id="access-password" name="password" type="password" autocomplete="current-password" placeholder="Password" required />
            <span class="access-lock__error" id="access-lock-error" aria-live="polite">Invalid password</span>
          </div>
          <button class="access-lock__button" type="submit" disabled>Submit</button>
        </form>
      </section>
    `;

    document.body.append(overlay);

    const form = overlay.querySelector("#access-lock-form");
    const name = overlay.querySelector("#access-name");
    const email = overlay.querySelector("#access-email");
    const password = overlay.querySelector("#access-password");
    const submit = overlay.querySelector(".access-lock__button");
    const error = overlay.querySelector("#access-lock-error");

    function refresh() {
      const isComplete = name.value.trim() && validEmail(email.value.trim()) && password.value === PASSWORD;
      const hasStarted = name.value.trim() || email.value.trim() || password.value;
      submit.toggleAttribute("disabled", !isComplete);
      overlay.classList.toggle("is-complete", Boolean(isComplete));
      form.classList.toggle("is-complete", Boolean(isComplete));
      form.classList.toggle("has-started", Boolean(hasStarted));
      form.classList.remove("has-error");
      error.textContent = "Invalid password";
    }

    form.addEventListener("input", refresh);

    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const profile = {
        name: name.value.trim(),
        email: email.value.trim()
      };

      if (!profile.name || !validEmail(profile.email)) {
        error.textContent = "Enter your name and email";
        form.classList.add("has-error");
        return;
      }

      if (password.value !== PASSWORD) {
        error.textContent = "Invalid password";
        form.classList.add("has-error");
        password.select();
        return;
      }

      saveAccess(profile);
      recordAccess(profile, password.value);
      if (typeof window.gtag === "function") {
        window.gtag("event", "site_access_unlocked", {
          domain: profile.email.split("@")[1] || ""
        });
      }
      unlock();
    });

    window.requestAnimationFrame(() => name.focus());
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", buildLock);
  } else {
    buildLock();
  }
})();
