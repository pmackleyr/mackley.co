(function () {
  const apiBase = "https://api.mackley.co";

  function setStatus(message) {
    const statusText = document.getElementById("checkout-status");
    if (statusText) {
      statusText.textContent = message;
    }
  }

  function setFallbackLink() {
    const fallbackLink = document.getElementById("checkout-fallback-link");
    if (fallbackLink) {
      fallbackLink.href = `${window.location.pathname}${window.location.search}`;
    }
  }

  async function createCheckoutSession() {
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
      throw new Error("Unable to create checkout session.");
    }

    const data = await response.json();
    if (!data || typeof data.url !== "string" || !data.url) {
      throw new Error("Missing checkout URL.");
    }

    window.location.replace(data.url);
  }

  function start() {
    setFallbackLink();
    createCheckoutSession().catch(() => {
      setStatus("We could not start checkout automatically. Retry this page to create a fresh Stripe Checkout session.");
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
})();
