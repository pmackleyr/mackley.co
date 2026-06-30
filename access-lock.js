(() => {
  const PASSWORD = "icanchange";
  const ACCESS_KEY = "mackley_access_lock_v1";
  const API_BASE = "https://api.mackley.co";

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

    fetch(`${API_BASE}/access-entry`, {
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

  async function postJson(path, payload) {
    const response = await fetch(`${API_BASE}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.ok === false) {
      const error = new Error(data.error || "request_failed");
      error.status = response.status;
      throw error;
    }
    return data;
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
          <label class="access-lock__description" id="access-lock-description" for="access-password">
            Enter password<br />
            to access the site.
          </label>
          <div class="access-lock__fields">
            <input class="access-lock__input access-lock__input--password" id="access-password" name="password" type="password" autocomplete="current-password" placeholder="Password" required />
            <input class="access-lock__input" id="access-name" name="name" type="text" autocomplete="name" placeholder="Name" hidden />
            <input class="access-lock__input" id="access-email" name="email" type="email" autocomplete="email" placeholder="Email" hidden />
            <span class="access-lock__error" id="access-lock-error" aria-live="polite">Invalid password</span>
          </div>
          <button class="access-lock__button" type="submit" hidden>Request password</button>
          <button class="access-lock__link" type="button">Request access</button>
        </form>
      </section>
    `;

    document.body.append(overlay);

    const form = overlay.querySelector("#access-lock-form");
    const description = overlay.querySelector("#access-lock-description");
    const name = overlay.querySelector("#access-name");
    const email = overlay.querySelector("#access-email");
    const password = overlay.querySelector("#access-password");
    const submit = overlay.querySelector(".access-lock__button");
    const requestAccess = overlay.querySelector(".access-lock__link");
    const error = overlay.querySelector("#access-lock-error");
    let mode = "password";
    let isBusy = false;
    let requestSent = false;

    function hasValidRequestContact() {
      return name.value.trim().length >= 2 && validEmail(email.value.trim());
    }

    function refresh() {
      const hasContact = hasValidRequestContact();
      const isComplete = mode === "request" ? hasContact : password.value;
      const hasStarted = name.value.trim() || email.value.trim() || password.value;
      if (mode === "request") {
        submit.toggleAttribute("disabled", !isComplete || requestSent);
      }
      overlay.classList.toggle("is-complete", Boolean(isComplete));
      form.classList.toggle("is-complete", Boolean(isComplete));
      form.classList.toggle("has-started", Boolean(hasStarted));
      if (!isBusy) {
        form.classList.remove("has-error");
        form.classList.remove("has-notice");
        if (mode === "request" && requestSent) {
          requestSent = false;
          submit.textContent = "Request password";
        }
        if (requestAccess.textContent === "Request sent") {
          requestAccess.textContent = "Request access";
        }
        error.textContent = "Invalid password";
      }
    }

    function setBusy(nextBusy, label, target = submit) {
      isBusy = nextBusy;
      submit.disabled = nextBusy;
      requestAccess.disabled = nextBusy;
      if (label) target.textContent = label;
    }

    function showError(message) {
      error.textContent = message;
      form.classList.remove("has-notice");
      form.classList.add("has-error");
    }

    function showNotice(message) {
      error.textContent = message;
      form.classList.remove("has-error");
      form.classList.add("has-notice");
    }

    function showPasswordMode() {
      mode = "password";
      description.innerHTML = "Enter password<br />to access the site.";
      password.hidden = false;
      name.hidden = true;
      email.hidden = true;
      submit.hidden = true;
      requestAccess.hidden = false;
      requestAccess.textContent = "Request access";
      password.focus();
      refresh();
    }

    function showRequestMode() {
      mode = "request";
      description.innerHTML = "Request password";
      password.hidden = true;
      name.hidden = false;
      email.hidden = false;
      submit.hidden = false;
      submit.textContent = "Request password";
      requestAccess.hidden = true;
      name.focus();
      refresh();
    }

    function requestMessage(errorName) {
      if (errorName === "email_not_configured") return "Email sending is not configured";
      if (errorName === "email_send_failed") return "Email could not be sent";
      if (errorName === "invalid_access_request") return "Enter your name and email";
      return "Try again";
    }

    async function sendAccessRequest() {
      const profile = {
        name: name.value.trim(),
        email: email.value.trim()
      };

      if (profile.name.length < 2 || !validEmail(profile.email)) {
        showError("Enter your name and email");
        return false;
      }

      let hadError = false;
      setBusy(true, "Requesting...");
      try {
        await postJson("/access-request", {
          name: profile.name,
          email: profile.email,
          page_path: window.location.pathname,
          page_url: window.location.href,
          referrer: document.referrer,
          language: navigator.language || "",
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || ""
        });
        showNotice("Access request sent");
        requestSent = true;
        submit.textContent = "Request sent";
        submit.disabled = true;
        if (typeof window.gtag === "function") {
          window.gtag("event", "site_access_requested", {
            domain: profile.email.split("@")[1] || ""
          });
        }
        return true;
      } catch (requestError) {
        hadError = true;
        showError(requestMessage(requestError.message));
        submit.textContent = "Request password";
        submit.disabled = !hasValidRequestContact();
        return false;
      } finally {
        isBusy = false;
        if (!hadError) submit.disabled = requestSent || !hasValidRequestContact();
      }
    }

    form.addEventListener("input", refresh);

    password.addEventListener("input", () => {
      if (mode !== "password" || password.value !== PASSWORD) return;

      const profile = {
        name: "Password access",
        email: ""
      };

      saveAccess(profile);
      recordAccess(profile, password.value);
      if (typeof window.gtag === "function") {
        window.gtag("event", "site_access_unlocked", {
          domain: ""
        });
      }
      unlock();
    });

    requestAccess.addEventListener("click", () => {
      if (isBusy) return;
      if (mode === "request") {
        showPasswordMode();
        return;
      }
      showRequestMode();
    });

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (mode === "request") await sendAccessRequest();
    });

    window.requestAnimationFrame(() => password.focus());
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", buildLock);
  } else {
    buildLock();
  }
})();
