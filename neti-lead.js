(function () {
  const apiBase = "https://api.mackley.co";
  const storageKey = "mackley_neti_lead_v1";

  function getStatus(form) {
    return form.querySelector("[data-neti-lead-status]");
  }

  function setStatus(form, message, state) {
    const status = getStatus(form);
    if (!status) return;
    status.textContent = message;
    status.dataset.state = state || "";
  }

  function normalizeEmail(value) {
    return String(value || "").trim().toLowerCase();
  }

  function isValidEmail(email) {
    return email.includes("@") && email.includes(".") && email.length > 5;
  }

  function saveLead(email) {
    try {
      window.localStorage.setItem(storageKey, JSON.stringify({
        email,
        capturedAt: new Date().toISOString()
      }));
    } catch (error) {
      // Email submission still works when storage is blocked.
    }
  }

  async function submitLead(form) {
    const input = form.elements.email;
    const trap = form.elements.website;
    const email = normalizeEmail(input && input.value);
    if (trap && trap.value) return;

    if (!isValidEmail(email)) {
      setStatus(form, "Enter a valid email address.", "error");
      if (input) input.focus();
      return;
    }

    saveLead(email);
    setStatus(form, "Sending the verification step...", "pending");
    form.classList.add("is-submitting");

    try {
      const response = await fetch(`${apiBase}/neti-pot/leads`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          email,
          page_url: window.location.href,
          referrer: document.referrer || "",
          source: "neti_pot_email_capture",
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "",
          language: navigator.language || ""
        })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data.ok === false) {
        throw new Error(data.error || "neti_lead_failed");
      }

      setStatus(form, "Check your email for the next step to verify shipping information and payment.", "success");
      form.classList.add("is-complete");
    } catch (error) {
      setStatus(form, "We could not send the email yet. Please try again in a moment.", "error");
    } finally {
      form.classList.remove("is-submitting");
    }
  }

  function focusNearestForm(trigger) {
    const target = trigger.getAttribute("href");
    let root = target && target.startsWith("#") ? document.querySelector(target) : null;
    if (!root) root = trigger.closest(".home-neti, .neti-page") || document;
    const form = root.matches && root.matches("[data-neti-lead-form]")
      ? root
      : root.closest && root.closest("[data-neti-lead-form]")
        ? root.closest("[data-neti-lead-form]")
        : root.querySelector("[data-neti-lead-form]") || document.querySelector("[data-neti-lead-form]");
    const input = form && form.elements.email;
    if (!form || !input) return;

    form.scrollIntoView({ behavior: "smooth", block: "center" });
    window.setTimeout(() => {
      input.focus({ preventScroll: true });
    }, 220);
  }

  document.querySelectorAll("[data-neti-lead-form]").forEach((form) => {
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      submitLead(form);
    });
  });

  document.querySelectorAll("[data-neti-email-focus]").forEach((trigger) => {
    trigger.addEventListener("click", (event) => {
      event.preventDefault();
      focusNearestForm(trigger);
    });
  });
})();
