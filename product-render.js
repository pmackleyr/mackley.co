(function (win, doc) {
  const product = win.MACKLEYProduct;
  if (!product) return;

  function setText(selector, value) {
    doc.querySelectorAll(selector).forEach((element) => {
      element.textContent = value;
    });
  }

  function setHtml(selector, value) {
    doc.querySelectorAll(selector).forEach((element) => {
      element.innerHTML = value;
    });
  }

  function renderCarousels() {
    doc.querySelectorAll("[data-product-carousel] .carousel-track").forEach((track) => {
      const fallbackImages = Array.from(track.querySelectorAll(".carousel-image")).map((image) => ({
        src: image.getAttribute("src"),
        alt: image.getAttribute("alt") || product.name
      })).filter((image) => image.src);
      const images = product.images.length >= fallbackImages.length ? product.images : fallbackImages;

      track.innerHTML = images.map((image, index) => `
        <div class="carousel-slide">
          <img class="carousel-image" src="${image.src}" alt="${image.alt}" ${index === 0 ? "decoding=\"async\" fetchpriority=\"high\"" : "loading=\"lazy\" decoding=\"async\""} />
        </div>
      `).join("");
    });
  }

  function renderBuyLinks() {
    doc.querySelectorAll("[data-product-buy]").forEach((link) => {
      link.href = product.intakeLink || "/spray-intake/?next=payment";
      link.textContent = product.ctaLabel || "Get Started";
      link.dataset.track = "get-started";
      link.dataset.item = product.name;
      link.dataset.stripeProductId = product.stripeProductId;
      link.dataset.value = product.value;
    });
  }

  function renderStory() {
    doc.querySelectorAll("[data-product-story]").forEach((story) => {
      story.innerHTML = product.story.map((paragraph) => `<p>${paragraph}</p>`).join("");
    });
  }

  doc.title = doc.body.classList.contains("product-page")
    ? `${product.name} | MACKLEY`
    : doc.title;

  doc.querySelectorAll("[data-product-aria]").forEach((element) => {
    element.setAttribute("aria-label", product.name);
  });

  setText("[data-product-name]", product.name);
  setHtml("[data-product-full-name]", product.fullNameHtml);
  setText("[data-product-audience]", product.audience);
  setText("[data-product-formula]", product.formula);
  setText("[data-product-purpose]", product.purpose);
  setText("[data-product-code]", product.code);
  renderCarousels();
  renderBuyLinks();
  renderStory();
  doc.documentElement.dataset.productRendered = product.name;
})(window, document);
