(function () {
  const catalog = window.MACKLEYCatalog || {};
  const currentProduct = window.MACKLEYProduct || {};
  const prescriptionProduct = catalog.inf || currentProduct;
  const CTA_HREF = prescriptionProduct.intakeLink || "/intake/?next=payment";
  const CTA_LABEL = prescriptionProduct.ctaLabel || "Get Prescription";
  const PRODUCT_NAME = prescriptionProduct.name || "Intranasal Neuropeptide Formula";
  const PRODUCT_ID = prescriptionProduct.stripeProductId || "prod_UgF2SFTaA6cCVy";
  const PRODUCT_VALUE = prescriptionProduct.value || "99";
  const DEFAULT_SCROLL_TICK_COUNT = 13;

  function productForButton(button) {
    const key = button?.dataset?.productKey || "inf";
    return catalog[key] || prescriptionProduct;
  }

  function ensureButtonLabel(button) {
    if (!button || button.querySelector(":scope > .ui-button__label")) return;
    const label = document.createElement("span");
    label.className = "ui-button__label";
    while (button.firstChild) label.append(button.firstChild);
    button.append(label);
  }

  function decorateButton(button, variant) {
    if (!button) return;
    button.classList.add("ui-button", variant === "primary" ? "ui-button--primary" : "ui-button--secondary");
    button.dataset.uiButton = variant;
    ensureButtonLabel(button);
  }

  function renderHeader() {
    const header = document.querySelector(".site-header");
    if (!header) return;

    header.innerHTML = `
      <nav class="site-header__nav" aria-label="Primary">
        <a class="site-title site-header__brand-link" href="/" aria-label="MACKLEY home">
          <span class="brand">MACKLEY</span>
        </a>
        <a class="site-header__link" href="/icanchange/">Formula</a>
        <a class="site-header__link" href="/support/">FAQ</a>
      </nav>
      <div class="cta-proof site-header__action">
        <p class="social-proof cta-hover-proof" data-proof="click" data-page="request-prescription" data-record="false" data-total="true" data-label="people clicked recently" data-singular="person clicked recently" aria-live="polite">0 people clicked recently</p>
        <a class="ui-button ui-button--primary site-header__cta" href="${CTA_HREF}" data-product-buy data-product-key="inf" data-commerce-action="request-prescription" data-track="get-started" data-item="${PRODUCT_NAME}" data-stripe-product-id="${PRODUCT_ID}" data-value="${PRODUCT_VALUE}"><span class="ui-button__label">${CTA_LABEL}</span></a>
      </div>
    `;
  }

  function renderFooter() {
    const footer = document.querySelector(".site-footer");
    if (!footer) return;

    footer.innerHTML = `
      <span class="site-footer__copy">@MACKLEY 2026</span>
      <nav class="site-footer__legal" aria-label="Legal">
        <a class="site-footer__link" href="/legal/">Privacy</a>
        <a class="site-footer__link" href="/terms/">Terms</a>
      </nav>
    `;
  }

  function decorateButtons() {
    document.querySelectorAll("[data-product-buy]").forEach((button) => {
      const buttonProduct = productForButton(button);
      button.textContent = buttonProduct.ctaLabel || CTA_LABEL;
      button.setAttribute("href", buttonProduct.intakeLink || CTA_HREF);
      button.dataset.productKey = buttonProduct.key || "inf";
      button.dataset.commerceAction = buttonProduct.commerceAction || "request-prescription";
      button.dataset.track = "get-started";
      button.dataset.item = buttonProduct.name || PRODUCT_NAME;
      if (buttonProduct.stripeProductId) button.dataset.stripeProductId = buttonProduct.stripeProductId;
      else delete button.dataset.stripeProductId;
      button.dataset.value = buttonProduct.value ?? PRODUCT_VALUE;
    });

    document.querySelectorAll(".home-product__button").forEach((button) => {
      decorateButton(button, button.matches("[data-product-buy]") ? "primary" : "secondary");
    });

    document.querySelectorAll(".cta, .product-block__cta, .modal__button, .access-lock__button").forEach((button) => {
      decorateButton(button, button.classList.contains("cta--primary") || button.matches("[data-product-buy]") ? "primary" : "secondary");
    });

    document.querySelectorAll(".intake-button").forEach((button) => {
      decorateButton(button, button.classList.contains("intake-button--back") ? "secondary" : "primary");
    });

    document.querySelectorAll(".ui-button").forEach(ensureButtonLabel);
  }

  function renderScrollGuide() {
    if (document.body.classList.contains("intake-page") || document.querySelector(".scroll-guide")) return;
    const activeNarrative = Array.from(document.querySelectorAll(".narrative"))
      .find((element) => element.offsetParent !== null);
    const tickCount = document.body.classList.contains("purpose-page")
      ? Math.max(1, activeNarrative?.querySelectorAll(".paragraph").length || 1)
      : DEFAULT_SCROLL_TICK_COUNT;
    const guide = document.createElement("aside");
    guide.className = "scroll-guide";
    guide.dataset.sectionCount = String(tickCount);
    guide.setAttribute("aria-hidden", "true");
    guide.innerHTML = `<span class="scroll-guide__track">${Array.from({ length: tickCount }, () => "<i class=\"scroll-guide__tick\"></i>").join("")}</span>`;
    document.body.append(guide);
  }

  function attachProofToHomeCtas() {
    document.querySelectorAll(".home-product__button[data-product-buy]").forEach((button) => {
      if (button.closest(".cta-proof")) return;
      const wrapper = document.createElement("span");
      wrapper.className = "cta-proof home-product__proof-wrap";
      const proof = document.createElement("p");
      proof.className = "social-proof cta-hover-proof";
      proof.dataset.proof = "click";
      proof.dataset.page = "request-prescription";
      proof.dataset.record = "false";
      proof.dataset.total = "true";
      proof.dataset.label = "people clicked recently";
      proof.dataset.singular = "person clicked recently";
      proof.setAttribute("aria-live", "polite");
      proof.textContent = "0 people clicked recently";

      button.parentNode.insertBefore(wrapper, button);
      wrapper.append(proof, button);
    });
  }

  function getScrollContainer() {
    const activeNarrative = Array.from(document.querySelectorAll(".narrative"))
      .find((element) => element.offsetParent !== null);
    if (activeNarrative) return activeNarrative;

    const page = document.querySelector(".page");
    if (page && page.scrollHeight > page.clientHeight + 8) return page;

    return document.scrollingElement || document.documentElement;
  }

  function isAtBottom(scroller) {
    if (!scroller) return false;
    const scrollTop = scroller === document.documentElement || scroller === document.body
      ? window.scrollY
      : scroller.scrollTop;
    const clientHeight = scroller === document.documentElement || scroller === document.body
      ? window.innerHeight
      : scroller.clientHeight;
    const scrollHeight = scroller === document.documentElement || scroller === document.body
      ? document.documentElement.scrollHeight
      : scroller.scrollHeight;
    return scrollTop + clientHeight >= scrollHeight - 24;
  }

  function scrollMetrics(scroller) {
    const isDocument = !scroller || scroller === document.documentElement || scroller === document.body;
    const top = isDocument ? window.scrollY : scroller.scrollTop;
    const client = isDocument ? window.innerHeight : scroller.clientHeight;
    const height = isDocument ? document.documentElement.scrollHeight : scroller.scrollHeight;
    const max = Math.max(0, height - client);
    return { max, progress: max > 0 ? Math.min(1, Math.max(0, top / max)) : 0 };
  }

  function updateScrollGuide() {
    const guide = document.querySelector(".scroll-guide");
    if (!guide) return;
    const scroller = getScrollContainer();
    const { max, progress: scrollProgress } = scrollMetrics(scroller);
    const netiActive = document.body.classList.contains("is-neti-active")
      || Boolean(scroller?.querySelector?.(".home-neti.active"));
    const homeSections = document.body.classList.contains("purpose-page")
      ? Array.from(scroller?.querySelectorAll?.(".paragraph") || []).filter((section) => {
        const narrative = section.closest(".narrative");
        return narrative && window.getComputedStyle(narrative).display !== "none";
      })
      : [];
    let progress = scrollProgress;

    if (homeSections.length > 1) {
      const center = scroller.scrollTop + (scroller.clientHeight / 2);
      const currentIndex = homeSections.reduce((closestIndex, section, index) => {
        const sectionCenter = section.offsetTop + (section.offsetHeight / 2);
        const closest = homeSections[closestIndex];
        const closestCenter = closest.offsetTop + (closest.offsetHeight / 2);
        return Math.abs(sectionCenter - center) < Math.abs(closestCenter - center) ? index : closestIndex;
      }, 0);
      progress = currentIndex / (homeSections.length - 1);
    }

    guide.hidden = max < 80 || netiActive;
    guide.style.setProperty("--scroll-progress", progress.toFixed(4));
    const ticks = Array.from(guide.querySelectorAll(".scroll-guide__tick"));
    const current = Math.round(progress * Math.max(0, ticks.length - 1));
    ticks.forEach((tick, index) => {
      tick.classList.toggle("is-passed", index < current);
      tick.classList.toggle("is-current", index === current);
    });
  }

  function isHomeProductInView() {
    if (!document.body.classList.contains("purpose-page")) return false;
    const scroller = getScrollContainer();
    const products = Array.from(scroller?.querySelectorAll?.(".home-product") || []);
    const product = products.at(-1);
    if (!scroller || !product) return false;
    return scroller.scrollTop + scroller.clientHeight / 2 >= product.offsetTop - 24;
  }

  function updateFooterVisibility() {
    const footer = document.querySelector(".site-footer");
    if (!footer) return;
    const homeEnd = isHomeProductInView() || (document.body.classList.contains("purpose-page") && document.body.classList.contains("is-product-active"));
    footer.classList.toggle("is-at-bottom", homeEnd || isAtBottom(getScrollContainer()));
  }

  function updateInsets() {
    const root = document.documentElement;
    const header = document.querySelector(".site-header");
    const footer = document.querySelector(".site-footer");
    root.style.setProperty("--header-h", `${header ? header.offsetHeight : 0}px`);
    root.style.setProperty("--footer-h", `${footer ? footer.offsetHeight : 0}px`);
  }

  function bindScrollVisibility() {
    const scroller = getScrollContainer();
    const update = () => window.requestAnimationFrame(() => {
      updateFooterVisibility();
      updateScrollGuide();
    });
    updateFooterVisibility();
    updateScrollGuide();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", () => {
      updateInsets();
      update();
    });

    if (scroller && scroller !== document.documentElement && scroller !== document.body) {
      scroller.addEventListener("scroll", update, { passive: true });
    }
  }

  renderHeader();
  renderFooter();
  decorateButtons();
  attachProofToHomeCtas();
  renderScrollGuide();
  updateInsets();
  bindScrollVisibility();

  document.addEventListener("click", (event) => {
    const target = event.target.closest("[data-commerce-action]");
    if (!target) return;
    document.dispatchEvent(new CustomEvent("mackley:commerce-intent", {
      detail: {
        action: target.dataset.commerceAction,
        item: target.dataset.item || productForButton(target).name || PRODUCT_NAME,
        stripeProductId: target.dataset.stripeProductId || productForButton(target).stripeProductId || "",
        value: target.dataset.value || productForButton(target).value || PRODUCT_VALUE
      }
    }));
  });

  window.MACKLEYStorefrontUI = {
    refresh() {
      decorateButtons();
      attachProofToHomeCtas();
      updateInsets();
      updateScrollGuide();
    }
  };

  if ("MutationObserver" in window) {
    let decorationFrame = 0;
    new MutationObserver(() => {
      if (decorationFrame) return;
      decorationFrame = window.requestAnimationFrame(() => {
        decorationFrame = 0;
        const pending = document.querySelector(".access-lock__button:not([data-ui-button]), .modal__button:not([data-ui-button])");
        if (pending) decorateButtons();
      });
    }).observe(document.body, { childList: true, subtree: true });
  }
})();
