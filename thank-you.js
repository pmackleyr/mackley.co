(function () {
  const apiBase = "https://api.mackley.co";
  const statusHeading = document.getElementById("thank-you-heading");
  const statusBody = document.getElementById("thank-you-body");
  const detailsCard = document.getElementById("thank-you-details");
  const detailsTotal = document.getElementById("thank-you-total");
  const detailsEmail = document.getElementById("thank-you-email");
  const detailsOrder = document.getElementById("thank-you-order");
  const referralCard = document.getElementById("thank-you-referral");
  const referralButton = document.getElementById("thank-you-share");
  const referralStatus = document.getElementById("thank-you-share-status");
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

  function intakePayload() {
    try {
      const key = "mackley_provider_intake";
      const receipt = JSON.parse(window.sessionStorage.getItem(key) || "null");
      if (receipt) return receipt;
      const legacy = JSON.parse(window.localStorage.getItem(key) || "null");
      if (!legacy) return null;
      const sanitized = {
        version: 2,
        requestId: String(legacy.requestId || ""),
        email: String(legacy.email || ""),
        fullName: String(legacy.fullName || ""),
        referral: legacy.referral && typeof legacy.referral === "object" ? legacy.referral : null,
        orderId: String(legacy.orderId || "")
      };
      window.sessionStorage.setItem(key, JSON.stringify(sanitized));
      window.localStorage.removeItem(key);
      return sanitized;
    } catch (error) {
      return null;
    }
  }

  async function shareReferral() {
    const intake = intakePayload();
    if (!intake?.email || !intake?.fullName) {
      if (referralStatus) referralStatus.textContent = "Your referral link could not be created on this device.";
      return;
    }
    if (referralButton) referralButton.disabled = true;
    try {
      const response = await fetch(`${apiBase}/referrals/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: intake.email,
          fullName: intake.fullName,
          priorReferral: intake.referral || null,
          shareDepth: Number(intake.referral?.shareDepth || 0) || 0
        })
      });
      const data = await response.json();
      if (!response.ok || !data.referralCode) throw new Error("referral_create_failed");
      const url = new URL("/intake/", window.location.origin);
      url.searchParams.set("ref", data.actorUserId);
      url.searchParams.set("code", data.referralCode);
      url.searchParams.set("offer", String(data.receiverOfferPercent || 10));
      url.searchParams.set("loop", data.loopId);
      url.searchParams.set("depth", String((Number(intake.referral?.shareDepth || 0) || 0) + 1));
      const share = {
        title: "INF by MACKLEY",
        text: "I got you 10% off INF if approved by a licensed provider.",
        url: url.toString()
      };
      window.MACKLEYAnalytics?.track?.("loop_supply_created", {
        actor_user_id: data.actorUserId,
        subject_user_id: "",
        loop_id: data.loopId,
        channel: "share",
        share_depth: Number(url.searchParams.get("depth")),
        referrer_user_id: intake.referral?.referrerUserId || ""
      });
      if (navigator.share) {
        await navigator.share(share);
        window.MACKLEYAnalytics?.track?.("loop_shared", {
          actor_user_id: data.actorUserId,
          subject_user_id: "",
          loop_id: data.loopId,
          channel: "native_share",
          share_depth: Number(url.searchParams.get("depth")),
          referrer_user_id: intake.referral?.referrerUserId || ""
        });
      } else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(`${share.text}\n${share.url}\nCode: ${data.displayCode || data.referralCode}`);
        window.MACKLEYAnalytics?.track?.("loop_link_copied", {
          actor_user_id: data.actorUserId,
          subject_user_id: "",
          loop_id: data.loopId,
          channel: "clipboard",
          share_depth: Number(url.searchParams.get("depth")),
          referrer_user_id: intake.referral?.referrerUserId || ""
        });
      }
      if (referralStatus) referralStatus.textContent = `Referral ready. Code: ${data.displayCode || data.referralCode}`;
    } catch (error) {
      if (referralStatus) referralStatus.textContent = "Referral sharing could not open. Please try again.";
    } finally {
      if (referralButton) referralButton.disabled = false;
    }
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
      setStatus("Authorization still processing", "We have your Stripe session, but the card authorization is not complete yet.");
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
    if (referralCard && intakePayload()) referralCard.hidden = false;

    setStatus("Pending Licensed Provider Review", "Your payment method is authorized, but you have not been charged. If approved, the authorization will be captured and your monthly prescription will begin. If denied, the hold will be released.");

    if (window.MACKLEYAnalytics && typeof window.MACKLEYAnalytics.track === "function") {
      window.MACKLEYAnalytics.track("payment_authorized_pending_review", {
        event_id: `authorization:${transactionId}`,
        transaction_id: transactionId,
        value,
        currency,
        order_status: data.orderStatus
      }, {
        transportType: "beacon"
      });
    }
  }

  verifySession().catch(() => {
    setStatus("We could not verify the authorization yet", "Please refresh this page in a moment. You will not be charged unless a licensed provider approves your request.");
  });
  referralButton?.addEventListener("click", shareReferral);
})();
