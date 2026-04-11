(function () {
  const doc = document;
  const win = window;
  const params = new URLSearchParams(win.location.search);
  const storage = win.localStorage;
  const sessionStore = win.sessionStorage;
  const sampleAdsEnabled = params.get("sampleAds") === "1" || storage.getItem("mackley_sample_ads") === "1";
  const clickParamsKey = "mackley_google_click_params";
  const firstTouchKey = "mackley_analytics_first_touch";
  const lastTouchKey = "mackley_analytics_last_touch";
  const visitorIdKey = "mackley_analytics_visitor_id";
  const sessionIdKey = "mackley_analytics_session_id";
  const sessionCountKey = "mackley_analytics_session_count";
  const sessionSeenKey = "mackley_analytics_session_seen";
  const queueKey = "mackley_analytics_queue_v2";
  const checkoutSkipKey = "mackley_skip_checkout_tracking";
  const socialProofEndpoint = "https://api.mackley.co/social-proof";
  const collectorUrl = "https://api.mackley.co/analytics/collect";
  const clickParamNames = ["gclid", "gclsrc", "wbraid", "gbraid", "fbclid", "msclkid"];
  const buyNowPreviewImages = [
    "/public/product/carousel-01.png",
    "/public/product/carousel-02.png",
    "/public/product/carousel-03.png",
    "/public/product/carousel-04.png"
  ];
  const itemName = "Original Copper Neti Pot";
  const scrollMilestones = [25, 50, 75, 90];
  const slotDefaults = {
    banner: "6300978111",
    rectangle: "6300978111",
    square: "6300978111"
  };

  let adsLoaded = false;
  let buyNowPreview = null;
  let buyNowPreviewImage = null;
  let buyNowPreviewDots = [];
  let buyNowPreviewIndex = 0;
  let buyNowPreviewTimer = null;
  let activeBuyNowPreviewLink = null;
  let flushingQueue = false;
  let maxScrollPercent = 0;
  let pageExitTracked = false;
  const pageStartedAt = Date.now();
  const firedScrollMilestones = new Set();
  const firedEngagementMilestones = new Set();

  function readMeta(name) {
    return doc.querySelector(`meta[name="${name}"]`)?.content?.trim() || "";
  }

  const globalConfig = win.MACKLEYAdsConfig || {};
  const config = {
    tagId: globalConfig.tagId || readMeta("google-tag-id") || storage.getItem("mackley_google_tag_id") || "",
    conversionLabel: globalConfig.conversionLabel || readMeta("google-ads-conversion-label") || storage.getItem("mackley_google_ads_conversion_label") || "",
    conversionTarget: globalConfig.conversionTarget || "",
    adsenseClient: readMeta("google-adsense-client") || storage.getItem("mackley_adsense_client") || "",
    currency: readMeta("store-currency") || "USD",
    value: Number(readMeta("store-value") || 30)
  };

  const conversionTarget = config.conversionTarget || (
    config.tagId && config.conversionLabel
      ? `${config.tagId}/${config.conversionLabel}`
      : ""
  );

  const adsenseClient = config.adsenseClient || (sampleAdsEnabled ? "ca-pub-3940256099942544" : "");

  win.dataLayer = win.dataLayer || [];
  win.gtag = win.gtag || function gtag() {
    win.dataLayer.push(arguments);
  };

  function sanitizeTrackingValue(value, max = 255) {
    if (typeof value !== "string") return "";
    return value.trim().slice(0, max);
  }

  function readStorage(area, key) {
    try {
      return area.getItem(key);
    } catch (error) {
      return null;
    }
  }

  function writeStorage(area, key, value) {
    try {
      area.setItem(key, value);
      return true;
    } catch (error) {
      return false;
    }
  }

  function readJson(area, key) {
    const raw = readStorage(area, key);
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch (error) {
      return null;
    }
  }

  function writeJson(area, key, value) {
    writeStorage(area, key, JSON.stringify(value));
  }

  function createId() {
    if (win.crypto?.randomUUID) {
      return win.crypto.randomUUID();
    }
    return `mk_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  }

  function resolveDeviceType() {
    const width = win.innerWidth || doc.documentElement.clientWidth || 0;
    if (width && width < 768) return "mobile";
    if (width && width < 1100) return "tablet";
    return "desktop";
  }

  function getOrCreateValue(area, key) {
    const existing = readStorage(area, key);
    if (existing) return existing;
    const next = createId();
    writeStorage(area, key, next);
    return next;
  }

  function getSessionCount() {
    const stored = Number(readStorage(storage, sessionCountKey) || 0);
    const alreadySeen = readStorage(sessionStore, sessionSeenKey);
    if (alreadySeen) {
      return stored || 1;
    }
    const next = stored + 1;
    writeStorage(storage, sessionCountKey, String(next));
    writeStorage(sessionStore, sessionSeenKey, "1");
    return next;
  }

  function padNumber(value) {
    return String(value).padStart(2, "0");
  }

  function normalizeMetricKey(value, suffix) {
    const normalized = sanitizeTrackingValue(value)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    if (!normalized) return "";
    const extra = suffix ? `-${suffix}` : "";
    return `${normalized}${extra}`.slice(0, 64);
  }

  function currentHourStamp() {
    const now = new Date();
    const year = now.getUTCFullYear();
    const month = padNumber(now.getUTCMonth() + 1);
    const day = padNumber(now.getUTCDate());
    const hour = padNumber(now.getUTCHours());
    return `${year}${month}${day}${hour}`;
  }

  function postMetric(page) {
    if (!page) return;
    fetch(socialProofEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        type: "view",
        page,
        record: true,
        total: true
      }),
      keepalive: true
    }).catch(() => {
      // Best-effort metric; ignore failures.
    });
  }

  function recordSiteMetric(metricName) {
    const metricKey = normalizeMetricKey(metricName);
    if (!metricKey) return;

    postMetric(metricKey);
    postMetric(normalizeMetricKey(metricName, currentHourStamp()));
  }

  function setCheckoutSkip() {
    writeStorage(storage, checkoutSkipKey, "1");
  }

  function consumeCheckoutSkip() {
    try {
      const shouldSkip = storage.getItem(checkoutSkipKey) === "1";
      if (shouldSkip) {
        storage.removeItem(checkoutSkipKey);
      }
      return shouldSkip;
    } catch (error) {
      return false;
    }
  }

  function readStoredClickParams() {
    return readJson(storage, clickParamsKey) || {};
  }

  function writeStoredClickParams(value) {
    writeJson(storage, clickParamsKey, value);
  }

  function captureClickParams() {
    const stored = readStoredClickParams();
    const next = { ...stored };
    let updated = false;

    clickParamNames.forEach((key) => {
      const value = sanitizeTrackingValue(params.get(key) || "");
      if (!value || next[key] === value) return;
      next[key] = value;
      updated = true;
    });

    if (!updated) return stored;

    next.captured_at = Date.now();
    next.landing_path = `${win.location.pathname}${win.location.search}`;
    writeStoredClickParams(next);
    return next;
  }

  function getClickParams() {
    const stored = readStoredClickParams();
    return clickParamNames.reduce((result, key) => {
      const value = sanitizeTrackingValue(stored[key] || "");
      if (value) {
        result[key] = value;
      }
      return result;
    }, {});
  }

  function appendClickParams(url) {
    try {
      const destination = new URL(url, win.location.origin);
      if (destination.origin !== win.location.origin) {
        return url;
      }

      const tracking = getClickParams();
      Object.entries(tracking).forEach(([key, value]) => {
        if (!destination.searchParams.has(key)) {
          destination.searchParams.set(key, value);
        }
      });

      return `${destination.pathname}${destination.search}${destination.hash}`;
    } catch (error) {
      return url;
    }
  }

  function supportsHoverPreview() {
    if (typeof win.matchMedia !== "function") return true;
    return win.matchMedia("(hover: hover) and (pointer: fine)").matches;
  }

  function clearBuyNowPreviewTimer() {
    if (!buyNowPreviewTimer) return;
    win.clearInterval(buyNowPreviewTimer);
    buyNowPreviewTimer = null;
  }

  function renderBuyNowPreview(index) {
    if (!buyNowPreview || !buyNowPreviewImage) return;
    buyNowPreviewImage.src = buyNowPreviewImages[index];
    buyNowPreviewDots.forEach((dot, dotIndex) => {
      dot.classList.toggle("is-active", dotIndex === index);
    });
  }

  function ensureBuyNowPreview() {
    if (buyNowPreview || !doc.body) return;

    const preview = doc.createElement("div");
    preview.className = "buy-now-preview";
    preview.setAttribute("aria-hidden", "true");
    preview.innerHTML = `
      <div class="buy-now-preview__media">
        <img class="buy-now-preview__image" src="${buyNowPreviewImages[0]}" alt="Original Copper Neti Pot preview" />
      </div>
      <div class="buy-now-preview__meta">
        <span class="buy-now-preview__title">Original Copper Neti Pot</span>
        <div class="buy-now-preview__dots" aria-hidden="true">
          ${buyNowPreviewImages.map(() => "<span class=\"buy-now-preview__dot\"></span>").join("")}
        </div>
      </div>
      <div class="buy-now-preview__arrow" aria-hidden="true"></div>
    `;

    doc.body.appendChild(preview);
    buyNowPreview = preview;
    buyNowPreviewImage = preview.querySelector(".buy-now-preview__image");
    buyNowPreviewDots = Array.from(preview.querySelectorAll(".buy-now-preview__dot"));
    renderBuyNowPreview(0);

    buyNowPreviewImages.forEach((src) => {
      const image = new win.Image();
      image.src = src;
    });
  }

  function positionBuyNowPreview(link) {
    if (!buyNowPreview) return;
    const rect = link.getBoundingClientRect();
    const margin = 16;
    const maxWidth = 240;
    const width = Math.min(maxWidth, win.innerWidth - margin * 2);
    const left = Math.min(
      win.innerWidth - width - margin,
      Math.max(margin, rect.left + rect.width / 2 - width / 2)
    );

    buyNowPreview.style.width = `${width}px`;
    buyNowPreview.style.left = `${left}px`;
    buyNowPreview.style.bottom = `${win.innerHeight - rect.top + 18}px`;
  }

  function showBuyNowPreview(link) {
    if (!supportsHoverPreview()) return;
    ensureBuyNowPreview();
    if (!buyNowPreview) return;

    activeBuyNowPreviewLink = link;
    buyNowPreviewIndex = 0;
    renderBuyNowPreview(buyNowPreviewIndex);
    positionBuyNowPreview(link);
    buyNowPreview.classList.add("is-visible");
    clearBuyNowPreviewTimer();
    buyNowPreviewTimer = win.setInterval(() => {
      buyNowPreviewIndex = (buyNowPreviewIndex + 1) % buyNowPreviewImages.length;
      renderBuyNowPreview(buyNowPreviewIndex);
    }, 1400);
  }

  function hideBuyNowPreview() {
    activeBuyNowPreviewLink = null;
    clearBuyNowPreviewTimer();
    if (buyNowPreview) {
      buyNowPreview.classList.remove("is-visible");
    }
  }

  function readReferrerDomain() {
    if (!doc.referrer) return "";
    try {
      return new URL(doc.referrer).hostname;
    } catch (error) {
      return "";
    }
  }

  function buildTouchSnapshot() {
    const clickIds = clickParamNames.reduce((result, key) => {
      const value = sanitizeTrackingValue(params.get(key) || "");
      if (value) {
        result[key] = value;
      }
      return result;
    }, {});

    const referrerDomain = readReferrerDomain();
    const source = sanitizeTrackingValue(params.get("utm_source") || "") || referrerDomain || "direct";
    const medium = sanitizeTrackingValue(params.get("utm_medium") || "")
      || (clickIds.gclid || clickIds.gbraid || clickIds.wbraid ? "paid_search" : referrerDomain ? "referral" : "direct");

    return {
      source,
      medium,
      campaign: sanitizeTrackingValue(params.get("utm_campaign") || "", 120),
      content: sanitizeTrackingValue(params.get("utm_content") || "", 120),
      term: sanitizeTrackingValue(params.get("utm_term") || "", 120),
      referrer_domain: referrerDomain,
      captured_at: new Date().toISOString(),
      landing_path: `${win.location.pathname}${win.location.search}`,
      click_ids: clickIds
    };
  }

  function captureAttribution() {
    const snapshot = buildTouchSnapshot();
    const existingFirst = readJson(storage, firstTouchKey);
    const shouldPersistLast = snapshot.source !== "direct"
      || snapshot.referrer_domain
      || snapshot.campaign
      || snapshot.content
      || snapshot.term
      || Object.keys(snapshot.click_ids).length > 0;

    if (!existingFirst) {
      writeJson(storage, firstTouchKey, snapshot);
    }

    if (shouldPersistLast) {
      writeJson(storage, lastTouchKey, snapshot);
    }

    return {
      first: readJson(storage, firstTouchKey) || snapshot,
      last: readJson(storage, lastTouchKey) || snapshot
    };
  }

  function trackingReady() {
    return Boolean(config.tagId) && typeof win.gtag === "function";
  }

  function resolvePageName() {
    const pathname = win.location.pathname;
    if (pathname === "/" || pathname === "/index.html") return "home";
    if (pathname.startsWith("/checkout")) return "checkout";
    if (pathname.startsWith("/thank-you")) return "thank_you";
    if (pathname.startsWith("/purpose")) return "purpose";
    if (pathname.startsWith("/legal")) return "legal";
    if (pathname.startsWith("/cookie")) return "cookie";
    if (pathname.startsWith("/product")) return "product";
    return pathname.replace(/^\/+|\/+$/g, "").replace(/\//g, "_") || "page";
  }

  const shouldSkipCheckoutTracking = win.location.pathname.startsWith("/checkout") && consumeCheckoutSkip();
  captureClickParams();
  const attribution = captureAttribution();
  const visitorId = getOrCreateValue(storage, visitorIdKey);
  const sessionId = getOrCreateValue(sessionStore, sessionIdKey);
  const sessionNumber = getSessionCount();
  const visitorType = sessionNumber > 1 ? "returning" : "new";
  const pageName = resolvePageName();

  function buildContext() {
    return {
      site_name: "mackley.co",
      visitor_id: visitorId,
      session_id: sessionId,
      session_number: sessionNumber,
      visitor_type: visitorType,
      page_name: pageName,
      page_title: doc.title,
      page_path: win.location.pathname,
      page_location: win.location.href,
      first_source: attribution.first?.source || "direct",
      first_medium: attribution.first?.medium || "direct",
      first_campaign: attribution.first?.campaign || "",
      last_source: attribution.last?.source || "direct",
      last_medium: attribution.last?.medium || "direct",
      last_campaign: attribution.last?.campaign || "",
      referrer_domain: readReferrerDomain(),
      language: sanitizeTrackingValue(win.navigator.language || "", 24),
      timezone: sanitizeTrackingValue(Intl.DateTimeFormat().resolvedOptions().timeZone || "", 60),
      device_type: resolveDeviceType(),
      currency: config.currency,
      value: config.value,
      screen_width: win.screen?.width || 0,
      screen_height: win.screen?.height || 0,
      viewport_width: win.innerWidth,
      viewport_height: win.innerHeight
    };
  }

  function readQueue() {
    return readJson(storage, queueKey) || [];
  }

  function writeQueue(queue) {
    writeJson(storage, queueKey, queue);
  }

  function enqueueCollectorEvent(name, payload) {
    const queue = readQueue();
    queue.push({
      event: name,
      payload
    });
    writeQueue(queue);
  }

  function flushQueueWithBeacon() {
    const queue = readQueue();
    if (!queue.length || !navigator.sendBeacon) return;

    const batch = queue.slice(0, 10);
    const blob = new Blob([JSON.stringify({ events: batch })], {
      type: "application/json"
    });

    if (navigator.sendBeacon(collectorUrl, blob)) {
      writeQueue(queue.slice(batch.length));
    }
  }

  async function flushQueue() {
    if (flushingQueue) return;
    flushingQueue = true;

    try {
      while (true) {
        const queue = readQueue();
        if (!queue.length) break;

        const batch = queue.slice(0, 10);
        const response = await fetch(collectorUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ events: batch }),
          keepalive: true
        });

        if (!response.ok) {
          break;
        }

        writeQueue(queue.slice(batch.length));
      }
    } catch (error) {
      // Preserve the queue for the next flush attempt.
    } finally {
      flushingQueue = false;
    }
  }

  function buildEventPayload(name, payload) {
    return {
      ...buildContext(),
      ...(payload || {}),
      event_name: name,
      event_id: sanitizeTrackingValue(payload?.event_id || "", 140) || createId(),
      event_time: new Date().toISOString()
    };
  }

  function sendCollectorEvent(name, payload, options) {
    const eventPayload = buildEventPayload(name, payload);
    enqueueCollectorEvent(name, eventPayload);
    if (options?.transportType === "beacon") {
      flushQueueWithBeacon();
    } else {
      flushQueue();
    }
    return eventPayload;
  }

  function trackEvent(name, payload, callback, options) {
    const collectorPayload = sendCollectorEvent(name, payload, options);

    if (!trackingReady()) {
      if (typeof callback === "function") {
        callback();
      }
      return collectorPayload;
    }

    const gtagPayload = {
      ...(payload || {})
    };

    if (typeof callback === "function") {
      let finished = false;
      const complete = () => {
        if (finished) return;
        finished = true;
        callback();
      };
      gtagPayload.event_callback = complete;
      win.setTimeout(complete, 180);
    }

    win.gtag("event", name, gtagPayload);
    return collectorPayload;
  }

  function trackPurchaseConversion(payload, callback) {
    if (!trackingReady() || !conversionTarget) {
      if (typeof callback === "function") {
        callback();
      }
      return false;
    }

    const eventPayload = {
      currency: config.currency,
      value: config.value,
      ...(payload || {}),
      send_to: conversionTarget
    };

    if (typeof callback === "function") {
      let finished = false;
      const complete = () => {
        if (finished) return;
        finished = true;
        callback();
      };
      eventPayload.event_callback = complete;
      win.setTimeout(complete, 180);
    }

    win.gtag("event", "conversion", eventPayload);
    return true;
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const existing = doc.querySelector(`script[src="${src}"]`);
      if (existing) {
        if (existing.dataset.loaded === "true") {
          resolve();
          return;
        }
        existing.addEventListener("load", resolve, { once: true });
        existing.addEventListener("error", reject, { once: true });
        return;
      }

      const script = doc.createElement("script");
      script.async = true;
      script.src = src;
      script.crossOrigin = "anonymous";
      script.addEventListener("load", () => {
        script.dataset.loaded = "true";
        resolve();
      }, { once: true });
      script.addEventListener("error", reject, { once: true });
      doc.head.appendChild(script);
    });
  }

  async function initAds() {
    if (!adsenseClient || adsLoaded) return Boolean(adsenseClient);
    try {
      await loadScript(`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(adsenseClient)}`);
      adsLoaded = true;
      return true;
    } catch (error) {
      return false;
    }
  }

  function hydrateAdSlots() {
    const slots = Array.from(doc.querySelectorAll("[data-ad-slot]"));
    if (!slots.length) return;

    if (!adsenseClient) {
      slots.forEach((slot) => {
        slot.classList.add("ad-slot--placeholder");
        const status = slot.querySelector("[data-ad-status]");
        if (status) {
          status.textContent = "Google Ads placeholder active. Add an AdSense client to request live inventory.";
        }
      });
      return;
    }

    initAds().then((ready) => {
      slots.forEach((slot) => {
        const status = slot.querySelector("[data-ad-status]");
        if (!ready) {
          slot.classList.add("ad-slot--placeholder");
          if (status) {
            status.textContent = "Google Ads script could not load in this environment.";
          }
          return;
        }

        const body = slot.querySelector(".ad-slot__body");
        if (!body) return;

        body.innerHTML = "";
        const ad = doc.createElement("ins");
        ad.className = "adsbygoogle";
        ad.style.display = "block";
        ad.setAttribute("data-ad-client", adsenseClient);
        ad.setAttribute("data-ad-slot", slot.dataset.googleSlot || slotDefaults[slot.dataset.adFormat] || slotDefaults.banner);
        ad.setAttribute("data-ad-format", slot.dataset.adFormat === "square" ? "rectangle" : "auto");
        ad.setAttribute("data-full-width-responsive", "true");
        body.appendChild(ad);

        slot.classList.remove("ad-slot--placeholder");
        slot.classList.add("ad-slot--live");
        if (status) {
          status.textContent = sampleAdsEnabled
            ? "Google sample ads requested for local QA."
            : "Live Google ad request sent.";
        }

        try {
          (win.adsbygoogle = win.adsbygoogle || []).push({});
        } catch (error) {
          slot.classList.remove("ad-slot--live");
          slot.classList.add("ad-slot--placeholder");
          if (status) {
            status.textContent = "Google Ads loaded, but this slot could not render.";
          }
        }
      });
    });
  }

  function buildTargetPayload(target) {
    const href = target.tagName === "A" ? target.getAttribute("href") || "" : "";
    const label = sanitizeTrackingValue(
      target.dataset.track
      || target.getAttribute("aria-label")
      || target.textContent
      || target.id
      || target.className
      || target.tagName,
      120
    );
    const nearestSection = target.closest("header, footer, main, section, article");
    const locationLabel = sanitizeTrackingValue(
      nearestSection?.getAttribute("aria-label")
      || nearestSection?.className
      || nearestSection?.tagName
      || "",
      80
    );

    return {
      target_label: label || "Unknown",
      target_href: href,
      interaction_type: target.tagName === "A" ? "link" : "button",
      target_location: locationLabel
    };
  }

  function instrumentGenericClicks() {
    doc.addEventListener("click", (event) => {
      const target = event.target.closest("a, button, [role=\"button\"]");
      if (!target) return;
      if (target.closest("[data-analytics-ignore]")) return;
      if (target.matches("[data-track=\"buy-now\"]")) return;

      const payload = buildTargetPayload(target);
      if (!payload.target_label && !payload.target_href) return;
      trackEvent("click_target", payload);
    });
  }

  function interceptBuyNowLinks() {
    const links = Array.from(doc.querySelectorAll("[data-track=\"buy-now\"]"));
    if (!links.length) return;

    if (supportsHoverPreview()) {
      ensureBuyNowPreview();
    }

    links.forEach((link) => {
      if (supportsHoverPreview()) {
        link.addEventListener("pointerenter", () => {
          showBuyNowPreview(link);
        });

        link.addEventListener("pointerleave", () => {
          if (activeBuyNowPreviewLink === link) {
            hideBuyNowPreview();
          }
        });

        link.addEventListener("focus", () => {
          showBuyNowPreview(link);
        });

        link.addEventListener("blur", () => {
          if (activeBuyNowPreviewLink === link) {
            hideBuyNowPreview();
          }
        });

        link.addEventListener("pointerdown", hideBuyNowPreview);
      }

      link.addEventListener("click", (event) => {
        const href = link.getAttribute("href");
        if (!href || href.startsWith("#")) return;

        event.preventDefault();
        hideBuyNowPreview();

        const value = Number(link.dataset.value || config.value);
        const payload = {
          currency: config.currency,
          value,
          item_name: link.dataset.item || itemName,
          click_text: sanitizeTrackingValue(link.textContent || "", 80),
          target_href: href
        };

        let navigated = false;
        const navigate = () => {
          if (navigated) return;
          navigated = true;
          setCheckoutSkip();
          win.location.assign(appendClickParams(href));
        };

        recordSiteMetric("buy-now");
        trackEvent("begin_checkout", payload, navigate);
        win.setTimeout(navigate, 180);
      });
    });
  }

  function bindPageView() {
    trackEvent("page_view", {
      is_landing_page: pageName === "home"
    });

    if (pageName === "home") {
      trackEvent("view_item", {
        item_name: itemName,
        currency: config.currency,
        value: config.value
      });
    }
  }

  function instrumentScrollDepth() {
    const onScroll = () => {
      const scrollableHeight = doc.documentElement.scrollHeight - win.innerHeight;
      if (scrollableHeight <= 0) return;
      const currentPercent = Math.round((win.scrollY / scrollableHeight) * 100);
      maxScrollPercent = Math.max(maxScrollPercent, currentPercent);

      scrollMilestones.forEach((milestone) => {
        if (currentPercent >= milestone && !firedScrollMilestones.has(milestone)) {
          firedScrollMilestones.add(milestone);
          trackEvent("scroll_depth", {
            percent_scrolled: milestone
          });
        }
      });
    };

    win.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
  }

  function instrumentEngagementMilestones() {
    [10, 30, 60].forEach((seconds) => {
      win.setTimeout(() => {
        if (firedEngagementMilestones.has(seconds)) return;
        firedEngagementMilestones.add(seconds);
        trackEvent("engagement_milestone", {
          milestone_seconds: seconds,
          max_scroll_percent: maxScrollPercent
        });
      }, seconds * 1000);
    });
  }

  function instrumentPageExit() {
    const trackExit = () => {
      if (pageExitTracked) return;
      pageExitTracked = true;
      trackEvent("page_exit", {
        engaged_time_seconds: Math.round((Date.now() - pageStartedAt) / 1000),
        max_scroll_percent: maxScrollPercent
      }, null, {
        transportType: "beacon"
      });
    };

    doc.addEventListener("visibilitychange", () => {
      if (doc.visibilityState !== "hidden") return;
      trackExit();
    });

    win.addEventListener("pagehide", trackExit);
  }

  function instrumentCtaImpressions() {
    const ctas = Array.from(doc.querySelectorAll("[data-track=\"buy-now\"]"));
    if (!ctas.length || !("IntersectionObserver" in win)) return;

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting || entry.intersectionRatio < 0.65) return;
        observer.unobserve(entry.target);
        const payload = buildTargetPayload(entry.target);
        trackEvent("cta_impression", {
          target_label: payload.target_label,
          target_href: payload.target_href,
          target_location: payload.target_location
        });
      });
    }, { threshold: [0.65] });

    ctas.forEach((cta) => observer.observe(cta));
  }

  function redirectTo(url, options) {
    if (shouldSkipCheckoutTracking) {
      win.location.replace(appendClickParams(url));
      return;
    }

    const payload = {
      currency: config.currency,
      value: Number(options?.value || config.value),
      target_href: url
    };

    let redirected = false;
    const finish = () => {
      if (redirected) return;
      redirected = true;
      win.location.replace(appendClickParams(url));
    };

    if (!options?.event) {
      finish();
      return;
    }

    trackEvent(options.event, payload, finish);
    win.setTimeout(finish, 180);
  }

  function ready() {
    captureClickParams();
    bindPageView();
    hydrateAdSlots();
    interceptBuyNowLinks();
    instrumentGenericClicks();
    instrumentScrollDepth();
    instrumentEngagementMilestones();
    instrumentPageExit();
    instrumentCtaImpressions();
    flushQueue();

    if (supportsHoverPreview()) {
      win.addEventListener("resize", () => {
        if (activeBuyNowPreviewLink) {
          positionBuyNowPreview(activeBuyNowPreviewLink);
        }
      });

      win.addEventListener("scroll", () => {
        if (activeBuyNowPreviewLink) {
          positionBuyNowPreview(activeBuyNowPreviewLink);
        }
      }, { passive: true });
    }

    if (win.location.pathname.startsWith("/checkout") && !shouldSkipCheckoutTracking) {
      recordSiteMetric("checkout-start");
      trackEvent("begin_checkout", {
        currency: config.currency,
        value: config.value,
        entry_method: "page_load"
      });
    }
  }

  win.addEventListener("online", flushQueue);
  win.addEventListener("beforeunload", flushQueueWithBeacon);

  win.MACKLEYAds = {
    appendClickParams,
    getClickParams,
    recordSiteMetric,
    redirectTo,
    trackEvent,
    trackPurchaseConversion,
    flushAnalytics: flushQueue
  };

  win.MACKLEYAnalytics = {
    context: buildContext,
    flush: flushQueue,
    track(name, payload, options) {
      return trackEvent(name, payload, null, options);
    }
  };

  if (doc.readyState === "loading") {
    doc.addEventListener("DOMContentLoaded", ready, { once: true });
  } else {
    ready();
  }
})();
