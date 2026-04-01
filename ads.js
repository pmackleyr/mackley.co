(function () {
  const doc = document;
  const params = new URLSearchParams(window.location.search);
  const storage = window.localStorage;
  const sampleAdsEnabled = params.get("sampleAds") === "1" || storage.getItem("mackley_sample_ads") === "1";
  const clickParamsKey = "mackley_google_click_params";
  const checkoutSkipKey = "mackley_skip_checkout_tracking";
  const socialProofEndpoint = "https://api.mackley.co/social-proof";
  const clickParamNames = ["gclid", "gclsrc", "wbraid", "gbraid"];

  function readMeta(name) {
    return doc.querySelector(`meta[name="${name}"]`)?.content?.trim() || "";
  }

  const globalConfig = window.MACKLEYAdsConfig || {};
  const config = {
    tagId: globalConfig.tagId || readMeta("google-tag-id") || storage.getItem("mackley_google_tag_id") || "",
    conversionLabel: globalConfig.conversionLabel || readMeta("google-ads-conversion-label") || storage.getItem("mackley_google_ads_conversion_label") || "",
    conversionTarget: globalConfig.conversionTarget || "",
    adsenseClient: readMeta("google-adsense-client") || storage.getItem("mackley_adsense_client") || "",
    currency: readMeta("store-currency") || "USD",
    value: Number(readMeta("store-value") || 50)
  };

  const conversionTarget = config.conversionTarget || (
    config.tagId && config.conversionLabel
      ? `${config.tagId}/${config.conversionLabel}`
      : ""
  );

  const adsenseClient = config.adsenseClient || (sampleAdsEnabled ? "ca-pub-3940256099942544" : "");
  const slotDefaults = {
    banner: "6300978111",
    rectangle: "6300978111",
    square: "6300978111"
  };

  let adsLoaded = false;

  window.dataLayer = window.dataLayer || [];
  window.gtag = window.gtag || function gtag() {
    window.dataLayer.push(arguments);
  };

  function sanitizeTrackingValue(value) {
    if (typeof value !== "string") return "";
    return value.trim().slice(0, 255);
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
    try {
      storage.setItem(checkoutSkipKey, "1");
    } catch (error) {
      // Ignore storage failures.
    }
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
    try {
      const raw = storage.getItem(clickParamsKey);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch (error) {
      return {};
    }
  }

  function writeStoredClickParams(value) {
    try {
      storage.setItem(clickParamsKey, JSON.stringify(value));
    } catch (error) {
      // Ignore storage failures.
    }
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

    if (!updated) return;

    next.captured_at = Date.now();
    next.landing_path = `${window.location.pathname}${window.location.search}`;
    writeStoredClickParams(next);
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
      const destination = new URL(url, window.location.origin);
      if (destination.origin !== window.location.origin) {
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

  const shouldSkipCheckoutTracking = window.location.pathname.startsWith("/checkout") && consumeCheckoutSkip();

  captureClickParams();

  function trackingReady() {
    return Boolean(config.tagId) && typeof window.gtag === "function";
  }

  function trackEvent(name, payload, callback) {
    if (!trackingReady()) {
      if (typeof callback === "function") {
        callback();
      }
      return false;
    }

    const eventPayload = {
      ...(payload || {})
    };

    if (typeof callback === "function") {
      eventPayload.event_callback = callback;
    }

    window.gtag("event", name, eventPayload);
    return true;
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
      eventPayload.event_callback = callback;
    }

    window.gtag("event", "conversion", eventPayload);
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
          (window.adsbygoogle = window.adsbygoogle || []).push({});
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

  function interceptBuyNowLinks() {
    const links = Array.from(doc.querySelectorAll("[data-track=\"buy-now\"]"));
    if (!links.length) return;

    links.forEach((link) => {
      link.addEventListener("click", (event) => {
        const href = link.getAttribute("href");
        if (!href || href.startsWith("#")) return;

        event.preventDefault();

        const value = Number(link.dataset.value || config.value);
        const payload = {
          currency: config.currency,
          value,
          item_name: link.dataset.item || "Original Copper Neti Pot",
          page_location: window.location.pathname
        };

        let navigated = false;
        const navigate = () => {
          if (navigated) return;
          navigated = true;
          setCheckoutSkip();
          window.location.assign(appendClickParams(href));
        };

        recordSiteMetric("buy-now");
        trackEvent("begin_checkout", payload, navigate);
        window.setTimeout(navigate, 150);
      });
    });
  }

  function bindExploreLinks() {
    const links = Array.from(doc.querySelectorAll("[data-track=\"learn-more\"]"));
    if (!links.length) return;

    links.forEach((link) => {
      link.addEventListener("click", () => {
        trackEvent("view_item", {
          item_name: link.dataset.item || "Original Copper Neti Pot",
          page_location: window.location.pathname
        });
      });
    });
  }

  function redirectTo(url, options) {
    if (shouldSkipCheckoutTracking) {
      window.location.replace(appendClickParams(url));
      return;
    }

    const payload = {
      currency: config.currency,
      value: Number(options?.value || config.value),
      page_location: window.location.pathname
    };

    let redirected = false;
    const finish = () => {
      if (redirected) return;
      redirected = true;
      window.location.replace(appendClickParams(url));
    };

    if (!options?.event) {
      finish();
      return;
    }

    trackEvent(options.event, payload, finish);
    window.setTimeout(finish, 150);
  }

  if (window.location.pathname.startsWith("/checkout") && !shouldSkipCheckoutTracking) {
    recordSiteMetric("checkout-start");
    trackEvent("begin_checkout", {
      currency: config.currency,
      value: config.value,
      page_location: window.location.pathname
    });
  }

  const ready = () => {
    captureClickParams();
    hydrateAdSlots();
    interceptBuyNowLinks();
    bindExploreLinks();
  };

  window.MACKLEYAds = {
    getClickParams,
    recordSiteMetric,
    redirectTo,
    trackEvent,
    trackPurchaseConversion
  };

  if (doc.readyState === "loading") {
    doc.addEventListener("DOMContentLoaded", ready, { once: true });
  } else {
    ready();
  }
})();
