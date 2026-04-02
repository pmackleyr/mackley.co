(function () {
  const apiBase = "https://api.mackley.co";
  const stripePaymentLink = document.querySelector("meta[name=\"stripe-payment-link\"]")?.content
    || "https://buy.stripe.com/5kQ4gzeDn2oq0qg2Yadwc00";
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

  function setFallbackLink() {
    const fallbackLink = document.getElementById("checkout-fallback-link");
    if (fallbackLink) {
      fallbackLink.href = stripePaymentLink;
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

  async function createCheckoutSession() {
    track("checkout_step_completed", {
      step: "checkout_page_loaded"
    });

    const tracking = window.MACKLEYAds && typeof window.MACKLEYAds.getClickParams === "function"
      ? window.MACKLEYAds.getClickParams()
      : {};

    const response = await fetch(`${apiBase}/create-checkout-session`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        quantity: 1,
        tracking
      })
    });

    if (!response.ok) {
      track("checkout_blocked", {
        reason: "checkout_session_request_failed"
      });
      throw new Error("Unable to create checkout session.");
    }

    const data = await response.json();
    if (!data || typeof data.url !== "string" || !data.url) {
      track("checkout_blocked", {
        reason: "checkout_session_url_missing"
      });
      throw new Error("Missing checkout URL.");
    }

    track("checkout_redirect", {
      target_href: data.url,
      checkout_session_id: data.id || "",
      destination: "stripe_checkout"
    });

    return data.url;
  }

  function start() {
    setFallbackLink();
    recordMetric("checkout-redirect");
    setStatus("Taking you to secure checkout now.");

    createCheckoutSession()
      .then((url) => {
        recordMetric("checkout-session-created");
        redirectTo(url);
      })
      .catch(() => {
        recordMetric("checkout-session-failed");
        recordMetric("checkout-link-fallback");
        setStatus("Continuing via secure Stripe checkout.");
        window.setTimeout(() => {
          redirectTo(stripePaymentLink);
        }, 60);
      });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
})();
