(() => {
  const ACCESS_KEY = "mackley-site-access-v1";
  const PASSWORD_HASH = "102d3e336bf22875508dfc94e8d703c21589db448a4b4ba2f0c4838d2cb97e68";

  function readAccess() {
    try {
      return window.sessionStorage.getItem(ACCESS_KEY);
    } catch (error) {
      return null;
    }
  }

  function saveAccess() {
    try {
      window.sessionStorage.setItem(ACCESS_KEY, PASSWORD_HASH);
    } catch (error) {
      // Ignore storage errors.
    }
  }

  function hasAccess() {
    return readAccess() === PASSWORD_HASH;
  }

  async function hashPassword(value) {
    const input = new TextEncoder().encode(value);
    const digest = await window.crypto.subtle.digest("SHA-256", input);
    const bytes = Array.from(new Uint8Array(digest));
    return bytes.map((byte) => byte.toString(16).padStart(2, "0")).join("");
  }

  function announceUnlock() {
    window.dispatchEvent(new CustomEvent("mackley:unlocked"));
  }

  function mountLockScreen() {
    if (!document.body) return;

    const lockRoot = document.createElement("div");
    lockRoot.className = "site-lock";
    lockRoot.innerHTML = `
      <div class="site-lock__panel" role="dialog" aria-modal="true" aria-labelledby="site-lock-title">
        <svg class="site-lock__icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M17 8V7C17 4.24 14.76 2 12 2C9.24 2 7 4.24 7 7V8C5.9 8 5 8.9 5 10V20C5 21.1 5.9 22 7 22H17C18.1 22 19 21.1 19 20V10C19 8.9 18.1 8 17 8ZM9 7C9 5.34 10.34 4 12 4C13.66 4 15 5.34 15 7V8H9V7ZM17 20H7V10H17V20Z"></path>
        </svg>
        <p class="site-lock__title" id="site-lock-title">Enter password<br />to access the site.</p>
        <form class="site-lock__form" novalidate>
          <label class="sr-only" for="site-lock-input">Password</label>
          <input class="site-lock__input" id="site-lock-input" name="password" type="password" autocomplete="current-password" />
          <p class="site-lock__error" role="status" aria-live="polite"></p>
          <button class="site-lock__button" type="submit">Submit</button>
        </form>
      </div>
    `;

    document.body.append(lockRoot);

    const form = lockRoot.querySelector(".site-lock__form");
    const input = lockRoot.querySelector(".site-lock__input");
    const error = lockRoot.querySelector(".site-lock__error");
    const button = lockRoot.querySelector(".site-lock__button");
    let isSubmitting = false;

    function clearError() {
      input.classList.remove("is-error");
      error.classList.remove("is-visible");
      error.textContent = "";
    }

    function showError() {
      input.classList.add("is-error");
      error.classList.add("is-visible");
      error.textContent = "Invalid password";
    }

    async function onSubmit(event) {
      event.preventDefault();
      if (isSubmitting) return;
      isSubmitting = true;
      button.disabled = true;
      clearError();

      const candidate = input.value.trim();
      if (!candidate) {
        showError();
        button.disabled = false;
        isSubmitting = false;
        return;
      }

      let isMatch = false;
      try {
        const candidateHash = await hashPassword(candidate);
        isMatch = candidateHash === PASSWORD_HASH;
      } catch (error) {
        isMatch = false;
      }

      if (isMatch) {
        saveAccess();
        document.documentElement.classList.remove("site-lock-active");
        lockRoot.remove();
        announceUnlock();
        return;
      }

      showError();
      input.value = "";
      input.focus();
      button.disabled = false;
      isSubmitting = false;
    }

    form.addEventListener("submit", onSubmit);
    input.addEventListener("input", clearError);
    window.requestAnimationFrame(() => input.focus());
  }

  if (hasAccess()) {
    announceUnlock();
    return;
  }

  document.documentElement.classList.add("site-lock-active");

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mountLockScreen, { once: true });
    return;
  }

  mountLockScreen();
})();
