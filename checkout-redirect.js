(function () {
  const intakeLink = "/intake/?next=payment";
  let redirectInFlight = false;

  function track(name, payload, options) {
    if (!window.MACKLEYAnalytics || typeof window.MACKLEYAnalytics.track !== "function") {
      return null;
    }
    return window.MACKLEYAnalytics.track(name, payload, options);
  }

  function setStatus(message) {
    const statusText = document.getElementById("checkout-status");
    if (statusText) {
      statusText.textContent = message;
    }
  }

  function setFallbackLink(href, label) {
    const fallbackLink = document.getElementById("checkout-fallback-link");
    if (fallbackLink) {
      fallbackLink.href = href;
      if (label) fallbackLink.textContent = label;
    }
  }

  function recordMetric(name) {
    if (window.MACKLEYAds && typeof window.MACKLEYAds.recordSiteMetric === "function") {
      window.MACKLEYAds.recordSiteMetric(name);
    }
  }

  function redirectTo(url) {
    if (redirectInFlight) return;
    redirectInFlight = true;
    window.location.replace(url);
  }

  function start() {
    setFallbackLink(intakeLink, "continue to provider survey");
    recordMetric("checkout-redirect");
    setStatus("A licensed provider survey is required before checkout.");
    track("checkout_step_completed", {
      step: "checkout_page_loaded"
    });

    track("checkout_redirect", {
      target_href: intakeLink,
      destination: "licensed_provider_survey"
    });
    window.setTimeout(() => {
      redirectTo(intakeLink);
    }, 60);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
})();
