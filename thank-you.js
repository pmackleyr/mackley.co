(function () {
  const apiBase = "https://api.mackley.co";
  const conversionTarget = "AW-18048135651/5495CNHNh5McEOPjgp5D";
  const statusHeading = document.getElementById("thank-you-heading");
  const statusBody = document.getElementById("thank-you-body");
  const detailsCard = document.getElementById("thank-you-details");
  const detailsTotal = document.getElementById("thank-you-total");
  const detailsEmail = document.getElementById("thank-you-email");
  const detailsOrder = document.getElementById("thank-you-order");
  const params = new URLSearchParams(window.location.search);
  const sessionId = params.get("session_id");

  function setStatus(title, body) {
    if (statusHeading) {
      statusHeading.textContent = title;
    }
    if (statusBody) {
      statusBody.textContent = body;
    }
  }

  function formatAmount(amount, currency) {
    const normalizedCurrency = (currency || "USD").toUpperCase();
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: normalizedCurrency
    }).format(amount);
  }

  function alreadyTracked(transactionId) {
    return window.localStorage.getItem(`mackley_purchase_conversion:${transactionId}`) === "1";
  }

  function markTracked(transactionId) {
    window.localStorage.setItem(`mackley_purchase_conversion:${transactionId}`, "1");
  }

  function firePurchaseConversion(order) {
    if (!order.transactionId || alreadyTracked(order.transactionId)) {
      return;
    }

    if (typeof window.gtag === "function") {
      window.gtag("event", "purchase", {
        transaction_id: order.transactionId,
        value: order.value,
        currency: order.currency
      });

      window.gtag("event", "conversion", {
        send_to: conversionTarget,
        value: order.value,
        currency: order.currency,
        transaction_id: order.transactionId
      });
    }

    markTracked(order.transactionId);
  }

  async function verifySession() {
    if (!sessionId) {
      setStatus("Order lookup missing", "We need a Stripe session id to confirm the purchase.");
      return;
    }

    const response = await fetch(`${apiBase}/verify-checkout-session`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ sessionId })
    });

    if (!response.ok) {
      throw new Error("Unable to verify checkout session.");
    }

    const data = await response.json();
    if (!data || !data.verified) {
      setStatus("Payment still processing", "We have your Stripe session, but it is not marked paid and complete yet.");
      return;
    }

    const currency = String(data.currency || "USD").toUpperCase();
    const value = Number(data.amountTotal || 0) / 100;
    const transactionId = data.paymentIntentId || data.sessionId;

    if (detailsCard) {
      detailsCard.hidden = false;
    }
    if (detailsTotal) {
      detailsTotal.textContent = formatAmount(value, currency);
    }
    if (detailsEmail) {
      detailsEmail.textContent = data.customerEmail || "Not provided";
    }
    if (detailsOrder) {
      detailsOrder.textContent = transactionId;
    }

    setStatus("Thank you. Your order is confirmed.", "Your payment was verified with Stripe and your receipt should be on the way.");

    firePurchaseConversion({
      currency,
      transactionId,
      value
    });
  }

  verifySession().catch(() => {
    setStatus("We could not verify the purchase yet", "Please refresh this page in a moment. We do not fire the Google Ads conversion until Stripe confirms payment.");
  });
})();
