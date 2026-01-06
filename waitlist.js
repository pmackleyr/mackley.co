(() => {
  const waitlistTriggers = Array.from(document.querySelectorAll(".waitlist-trigger"));
  const waitlistModal = document.getElementById("waitlist-modal");
  const shareModal = document.getElementById("share-modal");
  const waitlistForm = document.getElementById("waitlist-form");
  const referralInput = document.getElementById("referral-link");
  const shareLinks = Array.from(document.querySelectorAll("[data-share]"));
  const copyButton = document.querySelector("[data-copy]");
  const header = document.querySelector(".site-header");
  const footer = document.querySelector(".site-footer");
  let lastActiveElement = null;

  function updateInsets() {
    const root = document.documentElement;
    const headerHeight = header ? header.offsetHeight : 0;
    const footerHeight = footer ? footer.offsetHeight : 0;
    root.style.setProperty("--header-h", `${headerHeight}px`);
    root.style.setProperty("--footer-h", `${footerHeight}px`);
  }

  updateInsets();
  window.addEventListener("resize", updateInsets);

  if (!waitlistTriggers.length || !waitlistModal || !shareModal) {
    return;
  }

  function setModalState(modal, isOpen) {
    if (!modal) return;
    if (isOpen) {
      lastActiveElement = document.activeElement;
      modal.classList.add("is-open");
      modal.setAttribute("aria-hidden", "false");
      document.body.classList.add("modal-open");
      const focusTarget = modal.querySelector("input, button, a");
      if (focusTarget) focusTarget.focus();
    } else {
      modal.classList.remove("is-open");
      modal.setAttribute("aria-hidden", "true");
      if (!document.querySelector(".modal.is-open")) {
        document.body.classList.remove("modal-open");
      }
      if (lastActiveElement instanceof HTMLElement) {
        lastActiveElement.focus();
      }
    }
  }

  function closeAllModals() {
    setModalState(waitlistModal, false);
    setModalState(shareModal, false);
  }

  function getReferralCode() {
    const storageKey = "mackley_waitlist_ref";
    try {
      const stored = window.localStorage.getItem(storageKey);
      if (stored) return stored;
      const bytes = new Uint8Array(6);
      window.crypto.getRandomValues(bytes);
      const code = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
      window.localStorage.setItem(storageKey, code);
      return code;
    } catch (error) {
      return Math.random().toString(36).slice(2, 10);
    }
  }

  function buildReferralUrl() {
    const code = getReferralCode();
    const base = `${window.location.origin}${window.location.pathname}`;
    return `${base}?ref=${code}`;
  }

  function updateShareLinks(url) {
    const encodedUrl = encodeURIComponent(url);
    const text = encodeURIComponent("Join me on the MACKLEY waitlist.");
    shareLinks.forEach((link) => {
      const channel = link.dataset.share;
      if (channel === "facebook") {
        link.href = `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`;
      } else if (channel === "x") {
        link.href = `https://x.com/intent/tweet?url=${encodedUrl}&text=${text}`;
      } else if (channel === "linkedin") {
        link.href = `https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}`;
      } else if (channel === "email") {
        link.href = `mailto:?subject=${encodeURIComponent("MACKLEY waitlist")}&body=${text}%0A${encodedUrl}`;
      }
    });
  }

  function openWaitlistModal() {
    closeAllModals();
    setModalState(waitlistModal, true);
  }

  function openShareModal(referralUrl) {
    if (referralInput) referralInput.value = referralUrl;
    updateShareLinks(referralUrl);
    closeAllModals();
    setModalState(shareModal, true);
  }

  waitlistTriggers.forEach((trigger) => {
    trigger.addEventListener("click", openWaitlistModal);
  });

  [waitlistModal, shareModal].forEach((modal) => {
    modal.addEventListener("click", (event) => {
      if (event.target.matches("[data-modal-close]")) {
        setModalState(modal, false);
      }
    });
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeAllModals();
    }
  });

  if (waitlistForm) {
    waitlistForm.addEventListener("submit", (event) => {
      event.preventDefault();
      if (!waitlistForm.checkValidity()) {
        waitlistForm.reportValidity();
        return;
      }
      const formData = new FormData(waitlistForm);
      const firstName = String(formData.get("firstName") || "").trim();
      const email = String(formData.get("email") || "").trim();
      if (email) {
        const subject = encodeURIComponent("Waitlist signup");
        const body = encodeURIComponent(
          `New waitlist signup:\nName: ${firstName || "N/A"}\nEmail: ${email}`
        );
        window.location.href = `mailto:contact@mackley.co?subject=${subject}&body=${body}`;
      }
      const referralUrl = buildReferralUrl();
      openShareModal(referralUrl);
    });
  }

  if (copyButton && referralInput) {
    copyButton.addEventListener("click", async () => {
      const value = referralInput.value;
      if (!value) return;
      try {
        await navigator.clipboard.writeText(value);
        copyButton.classList.add("is-copied");
        window.setTimeout(() => copyButton.classList.remove("is-copied"), 1400);
      } catch (error) {
        referralInput.select();
        document.execCommand("copy");
      }
    });
  }
})();
