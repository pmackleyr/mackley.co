(function () {
  const CTA_HREF = "/spray-intake/?next=payment";
  const CTA_LABEL = "Get Prescription";
  const PRODUCT_NAME = "Intranasal Neuropeptide Formula";
  const PRODUCT_ID = "prod_UgF2SFTaA6cCVy";
  const PRODUCT_VALUE = "30";

  function renderHeader() {
    const header = document.querySelector(".site-header");
    if (!header) return;

    header.innerHTML = `
      <nav class="site-header__nav" aria-label="Primary">
        <a class="site-title site-header__brand-link" href="/" aria-label="MACKLEY home">
          <span class="brand">MACKLEY</span>
        </a>
        <a class="site-header__link blur-trigger" href="/product/">Formula</a>
        <a class="site-header__link blur-trigger" href="/support/">FAQ</a>
      </nav>
      <div class="cta-proof site-header__action">
        <p class="social-proof cta-hover-proof" data-proof="click" data-page="request-prescription" data-record="false" data-total="true" data-label="people clicked recently" data-singular="person clicked recently" aria-live="polite">Live activity updating</p>
        <a class="ui-button ui-button--primary site-header__cta blur-trigger" href="${CTA_HREF}" data-product-buy data-track="get-started" data-item="${PRODUCT_NAME}" data-stripe-product-id="${PRODUCT_ID}" data-value="${PRODUCT_VALUE}">${CTA_LABEL}</a>
      </div>
    `;
  }

  function renderFooter() {
    const footer = document.querySelector(".site-footer");
    if (!footer) return;

    footer.innerHTML = `
      <span class="site-footer__copy">@MACKLEY 2026</span>
      <nav class="site-footer__legal" aria-label="Legal">
        <a class="site-footer__link blur-trigger" href="/legal/">Privacy</a>
        <a class="site-footer__link blur-trigger" href="/terms/">Terms</a>
      </nav>
    `;
  }

  function decorateButtons() {
    document.querySelectorAll(".home-product__button").forEach((button) => {
      button.classList.add("ui-button", button.matches("[data-product-buy]") ? "ui-button--primary" : "ui-button--secondary", "blur-trigger");
    });

    document.querySelectorAll(".cta, .product-block__cta, .modal__button, .access-lock__button").forEach((button) => {
      button.classList.add("ui-button");
      button.classList.add(button.classList.contains("cta--primary") || button.matches("[data-product-buy]") ? "ui-button--primary" : "ui-button--secondary");
      if (!button.classList.contains("access-lock__button")) button.classList.add("blur-trigger");
    });

    document.querySelectorAll(".intake-button").forEach((button) => {
      button.classList.add("ui-button", button.classList.contains("intake-button--back") ? "ui-button--secondary" : "ui-button--primary");
    });

    document.querySelectorAll("[data-product-buy]").forEach((button) => {
      button.textContent = CTA_LABEL;
      button.setAttribute("href", CTA_HREF);
      button.dataset.track = "get-started";
      button.dataset.item = PRODUCT_NAME;
      button.dataset.stripeProductId = PRODUCT_ID;
      button.dataset.value = PRODUCT_VALUE;
    });
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
      proof.textContent = "Live activity updating";

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

  function isHomeProductInView() {
    if (!document.body.classList.contains("purpose-page")) return false;
    const scroller = getScrollContainer();
    const product = scroller?.querySelector?.(".home-product");
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
    const update = () => window.requestAnimationFrame(updateFooterVisibility);
    updateFooterVisibility();
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
  updateInsets();
  bindScrollVisibility();
})();
