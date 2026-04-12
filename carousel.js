/*
  Carousel variables live in styles.css under .carousel.
  Add/remove slides by duplicating .carousel-slide nodes inside .carousel-track.
*/

const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function trackCarouselInteraction(payload) {
  if (!window.MACKLEYAnalytics || typeof window.MACKLEYAnalytics.track !== "function") {
    return;
  }

  window.MACKLEYAnalytics.track("carousel_interaction", payload);
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

class Carousel {
  constructor(root) {
    this.root = root;
    this.viewport = root.querySelector(".carousel-viewport");
    this.track = root.querySelector(".carousel-track");
    this.slides = Array.from(root.querySelectorAll(".carousel-slide"));
    this.images = Array.from(root.querySelectorAll(".carousel-image"));
    this.prevButton = root.querySelector(".carousel-button--prev");
    this.nextButton = root.querySelector(".carousel-button--next");
    this.dots = root.querySelector(".carousel-dots");
    this.currentIndex = 0;
    this.step = 0;
    this.translateX = 0;
    this.isDragging = false;
    this.isPointerDown = false;
    this.startX = 0;
    this.startY = 0;
    this.startTranslate = 0;
    this.dragAxis = null;
    this.autoRotateTimer = null;
    this.autoRotateDelayMs = 3200;
    this.preloadImages();
    this.setupDots();
    this.bindEvents();
    this.bindBuyNowHover();
    this.measure();
    this.goTo(0, false);
  }

  preloadImages() {
    this.images.forEach((image) => {
      image.loading = "eager";
    });
  }

  setupDots() {
    this.dots.innerHTML = "";
    this.dotButtons = this.slides.map((_, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.setAttribute("aria-label", `Go to slide ${index + 1}`);
      button.dataset.index = String(index);
      this.dots.appendChild(button);
      return button;
    });
  }

  bindEvents() {
    this.dotButtons.forEach((button) => {
      button.addEventListener("click", () => {
        this.goTo(Number(button.dataset.index), true, { source: "dot" });
      });
    });

    this.prevButton.addEventListener("click", () => {
      this.goTo(this.currentIndex - 1, true, { source: "prev" });
    });

    this.nextButton.addEventListener("click", () => {
      this.goTo(this.currentIndex + 1, true, { source: "next" });
    });

    this.viewport.addEventListener("keydown", (event) => {
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        this.goTo(this.currentIndex - 1, true, { source: "keyboard" });
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        this.goTo(this.currentIndex + 1, true, { source: "keyboard" });
      }
    });

    this.viewport.addEventListener("pointerdown", (event) => this.onPointerDown(event));
    this.viewport.addEventListener("pointermove", (event) => this.onPointerMove(event));
    this.viewport.addEventListener("pointerup", () => this.onPointerUp());
    this.viewport.addEventListener("pointercancel", () => this.onPointerUp());
    this.viewport.addEventListener("pointerleave", () => this.onPointerUp());

    window.addEventListener("resize", () => {
      this.measure();
      this.goTo(this.currentIndex, false);
    });
  }

  bindBuyNowHover() {
    const buyNowLinks = Array.from(document.querySelectorAll('[data-track="buy-now"]'));
    if (!buyNowLinks.length) return;

    const onEnter = () => {
      this.goTo(0, true, { source: "buy_now_hover" });
      this.startAutoRotate();
    };

    const onLeave = () => {
      this.stopAutoRotate();
    };

    buyNowLinks.forEach((link) => {
      link.addEventListener("pointerenter", onEnter);
      link.addEventListener("focus", onEnter);
      link.addEventListener("pointerleave", onLeave);
      link.addEventListener("blur", onLeave);
      link.addEventListener("pointerdown", onLeave);
    });
  }

  measure() {
    if (!this.slides[0]) return;
    const slideRect = this.slides[0].getBoundingClientRect();
    const trackStyles = window.getComputedStyle(this.track);
    const gap = parseFloat(trackStyles.columnGap || trackStyles.gap || 0);
    this.step = slideRect.width + gap;
    this.viewportWidth = this.viewport.clientWidth;
  }

  translateFor(index) {
    const slideWidth = this.slides[0].getBoundingClientRect().width;
    return (this.viewportWidth - slideWidth) / 2 - index * this.step;
  }

  updateActiveStates() {
    this.slides.forEach((slide, index) => {
      slide.classList.toggle("is-active", index === this.currentIndex);
    });

    this.dotButtons.forEach((button, index) => {
      button.setAttribute("aria-current", index === this.currentIndex ? "true" : "false");
    });
  }

  applyTransform(animate) {
    if (prefersReducedMotion || !animate) {
      this.track.style.transition = "none";
    } else {
      this.track.style.transition = "transform 420ms ease";
    }
    this.track.style.transform = `translate3d(${this.translateX}px, 0, 0)`;
    this.updateActiveStates();
  }

  goTo(index, animate, meta = null) {
    const previousIndex = this.currentIndex;
    const nextIndex = clamp(index, 0, this.slides.length - 1);
    this.currentIndex = nextIndex;
    this.translateX = this.translateFor(nextIndex);
    this.applyTransform(animate);

    if (meta?.source && nextIndex !== previousIndex) {
      trackCarouselInteraction({
        interaction_source: meta.source,
        from_index: previousIndex,
        to_index: nextIndex
      });
    }
  }

  startAutoRotate() {
    this.stopAutoRotate();
    this.autoRotateTimer = window.setInterval(() => {
      const nextIndex = (this.currentIndex + 1) % this.slides.length;
      this.goTo(nextIndex, true, { source: "auto_rotate" });
    }, this.autoRotateDelayMs);
  }

  stopAutoRotate() {
    if (!this.autoRotateTimer) return;
    window.clearInterval(this.autoRotateTimer);
    this.autoRotateTimer = null;
  }

  onPointerDown(event) {
    this.stopAutoRotate();
    this.isPointerDown = true;
    this.isDragging = false;
    this.startX = event.clientX;
    this.startY = event.clientY;
    this.startTranslate = this.translateX;
    this.dragAxis = null;
    this.track.style.transition = "none";
    this.viewport.setPointerCapture(event.pointerId);
  }

  onPointerMove(event) {
    if (!this.isPointerDown) return;
    const deltaX = event.clientX - this.startX;
    const deltaY = event.clientY - this.startY;

    if (!this.dragAxis) {
      const threshold = 8;
      if (Math.abs(deltaX) < threshold && Math.abs(deltaY) < threshold) return;
      this.dragAxis = Math.abs(deltaX) > Math.abs(deltaY) ? "x" : "y";
    }

    if (this.dragAxis !== "x") return;
    if (!this.isDragging) {
      this.isDragging = true;
    }
    event.preventDefault();
    const delta = event.clientX - this.startX;
    this.translateX = this.startTranslate + delta;
    this.applyTransform(false);
  }

  onPointerUp() {
    if (!this.isPointerDown) return;
    this.isPointerDown = false;
    if (!this.isDragging) return;
    this.isDragging = false;
    this.dragAxis = null;
    const slideWidth = this.slides[0].getBoundingClientRect().width;
    const base = (this.viewportWidth - slideWidth) / 2;
    const index = Math.round((base - this.translateX) / this.step);
    this.goTo(index, true, { source: "drag" });
  }
}

document.querySelectorAll(".carousel").forEach((carousel) => {
  new Carousel(carousel);
});
