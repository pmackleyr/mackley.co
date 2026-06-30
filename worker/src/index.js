import {
  AnalyticsStore,
  analyticsCorsHeaders,
  handleAccessEntries,
  handleAccessEntry,
  handleAnalyticsCollect
} from "./analytics.js";
import { authorizeOperator } from "./auth.js";
import {
  ORDER_STATUS,
  assertOrderTransition,
  isOrderStatus,
  isTerminalOrderStatus
} from "./domain/order-state.js";
import { buildOpsDashboard } from "./ops-dashboard.js";

const ALLOWED_HOSTS = new Set([
  "mackley.co",
  "mackley.co:443",
  "www.mackley.co",
  "www.mackley.co:443",
  "mackley.co",
  "mackley.co:443",
  "www.mackley.co",
  "www.mackley.co:443",
  "mackleyco.vercel.app",
  "mackley.vercel.app",
  "localhost:3000",
  "localhost:8000",
  "localhost:5173",
  "127.0.0.1:8000",
  "127.0.0.1:8017",
  "127.0.0.1:8011",
  "127.0.0.1:5500"
]);

const CLICK_TRACKING_KEYS = ["gclid", "gclsrc", "wbraid", "gbraid"];
const CHECKOUT_SUCCESS_URL = "https://mackley.co/thank-you?session_id={CHECKOUT_SESSION_ID}";
const CHECKOUT_CANCEL_URL = "https://mackley.co/intake/?checkout=canceled";
const PRODUCT_NAME = "Intranasal Neuropeptide Formula";
const PRODUCT_ID = "prod_UgF2SFTaA6cCVy";
const PRODUCT_PRICE_ID = "price_1Tn1iaH2VzsYlSl5EgIJwOwV";
const PRODUCT_SKU = "INF-01";
const PRODUCT_UNIT_AMOUNT = 9900;
const STRIPE_SIGNATURE_TOLERANCE_SECONDS = 300;

function originFromHeader(value) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return `${url.protocol}//${url.host}`;
  } catch (error) {
    return null;
  }
}

function isAllowedOrigin(origin) {
  const normalized = originFromHeader(origin);
  if (!normalized) return false;
  const host = new URL(normalized).host;
  return ALLOWED_HOSTS.has(host);
}

function inferOriginFromReferer(referer) {
  return originFromHeader(referer);
}

function corsOriginForSocialProof(origin) {
  if (!origin || origin === "null") return "*";
  return origin;
}

function jsonResponse(status, data, origin) {
  const headers = {
    "Content-Type": "application/json"
  };
  if (origin) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Vary"] = "Origin";
    if (origin !== "*") headers["Access-Control-Allow-Credentials"] = "true";
  }
  return new Response(JSON.stringify(data), { status, headers });
}

function withCorsHeaders(headers, origin, methods = "POST, OPTIONS", allowedHeaders = "Content-Type") {
  if (!origin) return headers;
  headers.set("Access-Control-Allow-Origin", origin);
  headers.set("Access-Control-Allow-Methods", methods);
  headers.set("Access-Control-Allow-Headers", allowedHeaders);
  headers.set("Vary", "Origin");
  if (origin !== "*") headers.set("Access-Control-Allow-Credentials", "true");
  return headers;
}

function isValidEmail(email) {
  return typeof email === "string" && email.includes("@") && email.trim().length > 3;
}

function isNonEmpty(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function hasAnyShippingField(shipping) {
  if (!shipping || typeof shipping !== "object") return false;
  return ["line1", "line2", "city", "state", "postal", "country"].some((key) => isNonEmpty(shipping[key]));
}

function isCompleteShipping(shipping) {
  if (!shipping || typeof shipping !== "object") return false;
  return isNonEmpty(shipping.line1)
    && isNonEmpty(shipping.city)
    && isNonEmpty(shipping.state)
    && isNonEmpty(shipping.postal)
    && isNonEmpty(shipping.country);
}

function normalizeQuantity(value) {
  const quantity = Number(value);
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 10) {
    return null;
  }
  return quantity;
}

function validatePaymentIntentBody(body) {
  if (!body || typeof body !== "object") {
    return "Invalid payload.";
  }

  const allowIncomplete = Boolean(body.allowIncomplete);
  const quantity = normalizeQuantity(body.quantity);
  if (!quantity) {
    return "Quantity must be between 1 and 10.";
  }

  if (!allowIncomplete || isNonEmpty(body.email)) {
    if (!isValidEmail(body.email)) {
      return "Email is required.";
    }
  }

  if (!allowIncomplete || isNonEmpty(body.name)) {
    if (!isNonEmpty(body.name)) {
      return "Name is required.";
    }
  }

  if (body.shipping && hasAnyShippingField(body.shipping)) {
    if (!isCompleteShipping(body.shipping)) {
      return "Shipping address is incomplete.";
    }
  }

  return null;
}

function validateCheckoutSessionBody(body) {
  if (!body || typeof body !== "object") {
    return "Invalid payload.";
  }

  const quantity = normalizeQuantity(body.quantity);
  if (!quantity) {
    return "Quantity must be between 1 and 10.";
  }

  if (!sanitizeTrackingValue(body.requestId)) {
    return "Provider request id is required.";
  }

  if (!isValidEmail(body.email) || !isNonEmpty(body.name)) {
    return "Customer name and email are required.";
  }

  return null;
}

function validateProviderRequestBody(body) {
  if (!body || typeof body !== "object") return "Invalid payload.";
  if (!isValidEmail(body.email)) return "Email is required.";
  if (!isNonEmpty(body.fullName)) return "Full name is required.";
  const age = Number(body.age);
  if (!Number.isInteger(age) || age < 18 || age > 120) return "Age must be between 18 and 120.";
  if (body.sex !== "Male" && body.sex !== "Female") return "Sex must be Male or Female.";
  if (!isNonEmpty(body.state)) return "State is required.";
  return null;
}

function normalizeAccessPassword(value) {
  const next = String(value || "").trim();
  return next || "jumpthegap";
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase().slice(0, 160);
}

function normalizeReferralCode(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 16);
}

function attachReferralMetadata(params, payload, options = {}) {
  const referral = payload && typeof payload === "object" ? payload.referral : null;
  if (!referral || typeof referral !== "object") return;

  const claimId = sanitizeTrackingValue(referral.claimId || referral.claim_id || "");
  const referrerActorId = sanitizeTrackingValue(referral.referrerActorId || referral.referrer_actor_id || "");
  const referralCode = normalizeReferralCode(referral.referrerCode || referral.referralCode || referral.code || "");
  const loopId = sanitizeTrackingValue(referral.loopId || referral.loop_id || "");

  if (claimId) {
    params.set("metadata[referral_claim_id]", claimId);
    if (options.checkoutSession) {
      params.set("payment_intent_data[metadata][referral_claim_id]", claimId);
    }
  }
  if (referrerActorId) {
    params.set("metadata[referrer_actor_id]", referrerActorId);
    if (options.checkoutSession) {
      params.set("payment_intent_data[metadata][referrer_actor_id]", referrerActorId);
    }
  }
  if (referralCode) {
    params.set("metadata[referral_code]", referralCode);
    if (options.checkoutSession) {
      params.set("payment_intent_data[metadata][referral_code]", referralCode);
    }
  }
  if (loopId) {
    params.set("metadata[referral_loop_id]", loopId);
    if (options.checkoutSession) {
      params.set("payment_intent_data[metadata][referral_loop_id]", loopId);
    }
  }
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

async function sendAccessRequestEmail(profile, requestInfo, env) {
  const apiKey = String(env.RESEND_API_KEY || "").trim();
  if (!apiKey) {
    return { ok: false, error: "email_not_configured" };
  }

  const from = String(env.ACCESS_EMAIL_FROM || "MACKLEY <onboarding@resend.dev>").trim();
  const notifyTo = String(env.ACCESS_REQUEST_NOTIFY_TO || "contact@mackley.co").trim();
  const pageUrl = String(requestInfo.page_url || "").slice(0, 260);
  const referrer = String(requestInfo.referrer || "").slice(0, 260);
  const language = String(requestInfo.language || "-").slice(0, 40);
  const timezone = String(requestInfo.timezone || "-").slice(0, 80);
  const htmlName = escapeHtml(profile.name);
  const htmlEmail = escapeHtml(profile.email);
  const htmlPageUrl = escapeHtml(pageUrl || "/");
  const htmlReferrer = escapeHtml(referrer || "-");
  const htmlLanguage = escapeHtml(language);
  const htmlTimezone = escapeHtml(timezone);
  const text = [
    "New MACKLEY access request",
    "",
    `Name: ${profile.name}`,
    `Email: ${profile.email}`,
    `Page: ${pageUrl || "/"}`,
    `Referrer: ${referrer || "-"}`,
    `Language: ${language}`,
    `Timezone: ${timezone}`,
    "",
    `Reply to ${profile.email} when you want to share access.`
  ].join("\n");

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from,
      to: [notifyTo],
      reply_to: profile.email,
      subject: `MACKLEY access request from ${profile.name}`,
      text,
      html: `
        <p>New MACKLEY access request.</p>
        <ul>
          <li><strong>Name:</strong> ${htmlName}</li>
          <li><strong>Email:</strong> ${htmlEmail}</li>
          <li><strong>Page:</strong> ${htmlPageUrl}</li>
          <li><strong>Referrer:</strong> ${htmlReferrer}</li>
          <li><strong>Language:</strong> ${htmlLanguage}</li>
          <li><strong>Timezone:</strong> ${htmlTimezone}</li>
        </ul>
        <p>Reply to ${htmlEmail} when you want to share access.</p>
      `
    })
  });

  if (!response.ok) {
    return { ok: false, error: "email_send_failed" };
  }

  return { ok: true };
}

async function sendEmailVerification(profile, requestId, token, env) {
  const apiKey = String(env.RESEND_API_KEY || "").trim();
  if (!apiKey || !isValidEmail(profile.email)) return { ok: false, error: "email_not_configured" };
  const verificationUrl = new URL("https://mackley.co/intake/");
  verificationUrl.searchParams.set("verify_email", token);
  verificationUrl.searchParams.set("request_id", requestId);
  const safeName = escapeHtml(profile.name);
  const safeUrl = escapeHtml(verificationUrl.toString());
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from: String(env.PAYMENTS_EMAIL_FROM || env.ACCESS_EMAIL_FROM || "MACKLEY <contact@mackley.co>").trim(),
      to: [normalizeEmail(profile.email)],
      subject: "Verify your email for MACKLEY",
      text: `Hi ${profile.name},\n\nVerify your email to complete your provider request:\n${verificationUrl}\n\nThis link expires in 24 hours.`,
      html: `<p>Hi ${safeName},</p><p>Verify your email to complete your provider request.</p><p><a href="${safeUrl}">Verify email</a></p><p>This link expires in 24 hours.</p>`
    })
  });
  return response.ok ? { ok: true } : { ok: false, error: "email_send_failed" };
}

function sanitizeTrackingValue(value) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, 255);
}

function normalizeTracking(body) {
  const tracking = body && typeof body === "object" ? body.tracking : null;
  if (!tracking || typeof tracking !== "object") return {};

  return CLICK_TRACKING_KEYS.reduce((result, key) => {
    const value = sanitizeTrackingValue(tracking[key]);
    if (value) {
      result[key] = value;
    }
    return result;
  }, {});
}

function isValidProofType(type) {
  return type === "view" || type === "click" || type === "purchase";
}

function normalizeWindow(windowSeconds) {
  const parsed = Number(windowSeconds);
  if (Number.isNaN(parsed)) return null;
  const clamped = Math.max(60, Math.min(parsed, 86400));
  return clamped;
}

function isValidPage(page) {
  return typeof page === "string" && /^[a-z0-9-]+$/.test(page) && page.length <= 64;
}

function normalizeGifPool(value) {
  return value === "inside" || value === "outside" ? value : "";
}

function normalizeGifAsset(value, pool) {
  if (typeof value !== "string" || !pool) return "";
  const asset = value.trim();
  const prefix = `/public/${pool}/`;
  return asset.startsWith(prefix) && /^[a-z0-9/_-]+\.gif$/i.test(asset) && asset.length <= 120
    ? asset
    : "";
}

async function stripePost(path, params, env, idempotencyKey = "") {
  const headers = {
    Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
    "Content-Type": "application/x-www-form-urlencoded"
  };
  if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;
  return fetch(`https://api.stripe.com/v1/${path}`, {
    method: "POST",
    headers,
    body: params.toString()
  });
}

async function stripeGet(path, env) {
  return fetch(`https://api.stripe.com/v1/${path}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`
    }
  });
}

function buildPaymentIntentParams(payload) {
  const quantity = normalizeQuantity(payload.quantity);
  const discount = Math.max(0, (quantity - 1) * 500);
  const amount = Math.max(0, quantity * PRODUCT_UNIT_AMOUNT - discount);
  const params = new URLSearchParams();
  params.set("amount", String(amount));
  params.set("currency", "usd");
  params.set("automatic_payment_methods[enabled]", "true");
  if (isValidEmail(payload.email)) {
    params.set("receipt_email", payload.email);
  }
  params.set("metadata[product]", PRODUCT_NAME);
  params.set("metadata[product_id]", PRODUCT_ID);
  params.set("metadata[sku]", PRODUCT_SKU);
  params.set("metadata[quantity]", String(quantity));
  if (isNonEmpty(payload.email)) {
    params.set("metadata[email]", payload.email);
  }
  if (isNonEmpty(payload.name)) {
    params.set("metadata[name]", payload.name);
  }

  if (isCompleteShipping(payload.shipping)) {
    params.set("shipping[name]", payload.name);
    params.set("shipping[address][line1]", payload.shipping.line1);
    if (payload.shipping.line2) {
      params.set("shipping[address][line2]", payload.shipping.line2);
    }
    params.set("shipping[address][city]", payload.shipping.city);
    params.set("shipping[address][state]", payload.shipping.state);
    params.set("shipping[address][postal_code]", payload.shipping.postal);
    params.set("shipping[address][country]", payload.shipping.country);
  }

  attachReferralMetadata(params, payload);

  return params;
}

function buildCheckoutSessionParams(payload) {
  const quantity = normalizeQuantity(payload.quantity);
  const tracking = normalizeTracking(payload);
  const params = new URLSearchParams();

  params.set("mode", "payment");
  if (payload.embedded) {
    params.set("ui_mode", "embedded");
    params.set("return_url", "https://mackley.co/intake/?checkout=return&session_id={CHECKOUT_SESSION_ID}");
    params.set("redirect_on_completion", "always");
  } else {
    params.set("success_url", CHECKOUT_SUCCESS_URL);
    params.set("cancel_url", CHECKOUT_CANCEL_URL);
  }
  params.set("client_reference_id", payload.orderId);
  params.set("customer_creation", "always");
  params.set("customer_email", normalizeEmail(payload.email));
  params.set("payment_method_types[0]", "card");
  params.set("line_items[0][price_data][currency]", "usd");
  params.set("line_items[0][price_data][product]", PRODUCT_ID);
  params.set("line_items[0][price_data][unit_amount]", String(PRODUCT_UNIT_AMOUNT));
  params.set("line_items[0][quantity]", String(quantity));
  params.set("billing_address_collection", "auto");
  params.set("shipping_address_collection[allowed_countries][0]", "US");
  params.set("custom_text[submit][message]", "Your payment method will be authorized today. You will only be charged after approval by a licensed provider.");
  params.set("payment_intent_data[capture_method]", "manual");
  params.set("payment_intent_data[setup_future_usage]", "off_session");
  params.set("metadata[product]", PRODUCT_NAME);
  params.set("metadata[product_id]", PRODUCT_ID);
  params.set("metadata[sku]", PRODUCT_SKU);
  params.set("metadata[quantity]", String(quantity));
  params.set("metadata[order_id]", payload.orderId);
  params.set("metadata[provider_request_id]", payload.requestId);
  params.set("metadata[order_status]", ORDER_STATUS.PENDING);
  params.set("payment_intent_data[metadata][product]", PRODUCT_NAME);
  params.set("payment_intent_data[metadata][product_id]", PRODUCT_ID);
  params.set("payment_intent_data[metadata][sku]", PRODUCT_SKU);
  params.set("payment_intent_data[metadata][quantity]", String(quantity));
  params.set("payment_intent_data[metadata][order_id]", payload.orderId);
  params.set("payment_intent_data[metadata][provider_request_id]", payload.requestId);
  params.set("payment_intent_data[metadata][order_status]", ORDER_STATUS.PENDING);

  Object.entries(tracking).forEach(([key, value]) => {
    params.set(`metadata[${key}]`, value);
    params.set(`payment_intent_data[metadata][${key}]`, value);
  });

  attachReferralMetadata(params, payload, { checkoutSession: true });

  return params;
}

async function redeemReferralFromCheckoutSession(data, env) {
  if (!env.REFERRAL_STORE || !data || typeof data !== "object") return null;

  const paymentIntent = data.payment_intent && typeof data.payment_intent === "object" ? data.payment_intent : null;
  const metadata = {
    ...(paymentIntent?.metadata || {}),
    ...(data.metadata || {})
  };
  const claimId = sanitizeTrackingValue(metadata.referral_claim_id || "");
  if (!claimId) return null;

  const orderId = typeof paymentIntent?.id === "string" && paymentIntent.id
    ? paymentIntent.id
    : typeof data.id === "string"
      ? data.id
      : "";
  if (!orderId) return null;

  const id = env.REFERRAL_STORE.idFromName("referrals");
  const stub = env.REFERRAL_STORE.get(id);
  const response = await stub.fetch("https://referrals/referrals/redeem", {
    method: "POST",
    body: JSON.stringify({
      adminAuthorized: true,
      claimId,
      referralCode: metadata.referral_code || "",
      orderId,
      sessionId: data.id || "",
      paymentIntentId: paymentIntent?.id || "",
      providerApprovedAt: new Date().toISOString()
    })
  });
  return response.json().catch(() => null);
}

function orderStoreStub(env) {
  if (!env.ORDER_STORE) return null;
  const id = env.ORDER_STORE.idFromName("provider-orders");
  return env.ORDER_STORE.get(id);
}

async function orderStoreRequest(env, path, payload = {}) {
  const stub = orderStoreStub(env);
  if (!stub) throw new Error("order_store_not_configured");
  const response = await stub.fetch(`https://orders${path}`, {
    method: "POST",
    body: JSON.stringify(payload)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || "order_store_error");
    error.status = response.status;
    throw error;
  }
  return data;
}

function createPublicId(prefix) {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "")}`;
}

function hexFromBytes(bytes) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function constantTimeEqual(left, right) {
  if (left.length !== right.length) return false;
  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1) {
    mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return mismatch === 0;
}

async function verifyStripeSignature(rawBody, signatureHeader, secret) {
  if (!signatureHeader || !secret) return false;
  const parts = signatureHeader.split(",").map((part) => part.trim());
  const timestamp = parts.find((part) => part.startsWith("t="))?.slice(2) || "";
  const signatures = parts.filter((part) => part.startsWith("v1=")).map((part) => part.slice(3));
  const timestampNumber = Number(timestamp);
  if (!Number.isFinite(timestampNumber) || !signatures.length) return false;
  if (Math.abs(Math.floor(Date.now() / 1000) - timestampNumber) > STRIPE_SIGNATURE_TOLERANCE_SECONDS) return false;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const digest = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${timestamp}.${rawBody}`));
  const expected = hexFromBytes(new Uint8Array(digest));
  return signatures.some((signature) => constantTimeEqual(signature, expected));
}

function authorizationExpiry(paymentIntent) {
  const captureBefore = paymentIntent?.latest_charge?.payment_method_details?.card?.capture_before;
  return Number.isFinite(captureBefore) ? new Date(captureBefore * 1000).toISOString() : null;
}

async function persistCheckoutOrder(session, env) {
  const paymentIntent = session?.payment_intent && typeof session.payment_intent === "object"
    ? session.payment_intent
    : null;
  const metadata = { ...(paymentIntent?.metadata || {}), ...(session?.metadata || {}) };
  const orderId = sanitizeTrackingValue(metadata.order_id || session?.client_reference_id || "");
  const requestId = sanitizeTrackingValue(metadata.provider_request_id || "");
  if (!orderId || !requestId || !paymentIntent?.id) throw new Error("incomplete_checkout_order");

  const order = {
    orderId,
    requestId,
    checkoutSessionId: session.id,
    paymentIntentId: paymentIntent.id,
    paymentMethodId: typeof paymentIntent.payment_method === "string" ? paymentIntent.payment_method : paymentIntent.payment_method?.id || null,
    customerId: typeof session.customer === "string" ? session.customer : session.customer?.id || null,
    customerEmail: normalizeEmail(session.customer_details?.email || session.customer_email || ""),
    amountAuthorized: Number.isFinite(session.amount_total) ? session.amount_total : PRODUCT_UNIT_AMOUNT,
    currency: typeof session.currency === "string" ? session.currency : "usd",
    authorizationExpiresAt: authorizationExpiry(paymentIntent),
    stripePaymentStatus: session.payment_status || null,
    stripeIntentStatus: paymentIntent.status || null,
    status: ORDER_STATUS.PENDING,
    referralClaimId: sanitizeTrackingValue(metadata.referral_claim_id || ""),
    referralCode: normalizeReferralCode(metadata.referral_code || ""),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  return orderStoreRequest(env, "/orders/upsert", { order });
}

async function retrieveCheckoutSession(sessionId, env) {
  const encodedSessionId = encodeURIComponent(sessionId);
  const response = await stripeGet(`checkout/sessions/${encodedSessionId}?expand[]=payment_intent.latest_charge`, env);
  const data = await response.json();
  if (!response.ok || !data.id) throw new Error("stripe_checkout_retrieve_failed");
  return data;
}

async function sendOrderStatusEmail(order, type, env) {
  const apiKey = String(env.RESEND_API_KEY || "").trim();
  const email = normalizeEmail(order?.customerEmail || "");
  if (!apiKey || !isValidEmail(email)) return { ok: false, error: "email_not_configured" };
  const approved = type === "approved";
  const subject = approved ? "Your MACKLEY prescription was approved" : "Your MACKLEY prescription request update";
  const lines = approved
    ? ["Your prescription has been approved.", "Your payment has now been processed.", "Your monthly INF subscription is active."]
    : ["Your prescription was not approved.", "Your authorization has been released.", "You have not been charged."];
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from: String(env.PAYMENTS_EMAIL_FROM || env.ACCESS_EMAIL_FROM || "MACKLEY <contact@mackley.co>").trim(),
      to: [email],
      subject,
      text: lines.join("\n\n"),
      html: lines.map((line) => `<p>${escapeHtml(line)}</p>`).join("")
    })
  });
  return response.ok ? { ok: true } : { ok: false, error: "email_send_failed" };
}

function oneMonthFromNowUnix() {
  const date = new Date();
  const day = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + 1);
  const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  date.setUTCDate(Math.min(day, lastDay));
  return Math.floor(date.getTime() / 1000);
}

async function approveProviderOrder(orderId, env, actor) {
  let { order } = await orderStoreRequest(env, "/orders/get", { orderId });
  if (!order) throw Object.assign(new Error("order_not_found"), { status: 404 });
  if (order.status === ORDER_STATUS.DENIED) throw Object.assign(new Error("order_already_denied"), { status: 409 });
  if (order.status !== ORDER_STATUS.ACTIVE) {
    if (order.status === ORDER_STATUS.PENDING) {
      await orderStoreRequest(env, "/orders/update", {
        orderId,
        patch: { status: ORDER_STATUS.PROCESSING, providerApprovedAt: new Date().toISOString() },
        actor,
        reason: "provider_approved"
      });
      order.status = ORDER_STATUS.PROCESSING;
    } else if (![ORDER_STATUS.PROCESSING, ORDER_STATUS.PAYMENT_CAPTURED].includes(order.status)) {
      throw Object.assign(new Error("order_not_ready_for_approval"), { status: 409 });
    }

    const intentResponse = await stripeGet(`payment_intents/${encodeURIComponent(order.paymentIntentId)}?expand[]=latest_charge`, env);
    let intent = await intentResponse.json();
    if (!intentResponse.ok || !intent.id) throw new Error("payment_intent_retrieve_failed");
    if (intent.status === "requires_capture") {
      const captureResponse = await stripePost(
        `payment_intents/${encodeURIComponent(intent.id)}/capture`,
        new URLSearchParams(),
        env,
        `mackley-capture-${orderId}`
      );
      intent = await captureResponse.json();
      if (!captureResponse.ok || intent.status !== "succeeded") throw new Error("payment_capture_failed");
      if (order.status !== ORDER_STATUS.PAYMENT_CAPTURED) {
        await orderStoreRequest(env, "/orders/update", {
          orderId,
          patch: { status: ORDER_STATUS.PAYMENT_CAPTURED, capturedAt: new Date().toISOString() },
          actor,
          reason: "authorization_captured"
        });
        order.status = ORDER_STATUS.PAYMENT_CAPTURED;
      }
    } else if (intent.status !== "succeeded") {
      throw Object.assign(new Error("authorization_not_capturable"), { status: 409 });
    }

    const paymentMethodId = typeof intent.payment_method === "string" ? intent.payment_method : order.paymentMethodId;
    if (!order.subscriptionId) {
      const subscriptionParams = new URLSearchParams();
      subscriptionParams.set("customer", order.customerId);
      subscriptionParams.set("items[0][price]", PRODUCT_PRICE_ID);
      subscriptionParams.set("default_payment_method", paymentMethodId);
      subscriptionParams.set("collection_method", "charge_automatically");
      subscriptionParams.set("billing_cycle_anchor", String(oneMonthFromNowUnix()));
      subscriptionParams.set("proration_behavior", "none");
      subscriptionParams.set("metadata[order_id]", orderId);
      subscriptionParams.set("metadata[provider_request_id]", order.requestId);
      const subscriptionResponse = await stripePost(
        "subscriptions",
        subscriptionParams,
        env,
        `mackley-subscription-${orderId}`
      );
      const subscription = await subscriptionResponse.json();
      if (!subscriptionResponse.ok || !subscription.id) throw new Error("subscription_create_failed");
      order.subscriptionId = subscription.id;
    }

    await orderStoreRequest(env, "/orders/update", {
      orderId,
      patch: {
        status: ORDER_STATUS.ACTIVE,
        subscriptionId: order.subscriptionId,
        paymentMethodId,
        activatedAt: new Date().toISOString()
      },
      actor,
      reason: "subscription_activated"
    });

    const session = await retrieveCheckoutSession(order.checkoutSessionId, env);
    await redeemReferralFromCheckoutSession(session, env);
    ({ order } = await orderStoreRequest(env, "/orders/get", { orderId }));
  }

  if (!order.approvalEmailSentAt) {
    const email = await sendOrderStatusEmail(order, "approved", env);
    if (email.ok) {
      await orderStoreRequest(env, "/orders/update", {
        orderId,
        patch: { approvalEmailSentAt: new Date().toISOString() }
      });
    }
  }
  return orderStoreRequest(env, "/orders/get", { orderId });
}

async function denyProviderOrder(orderId, env, actor) {
  let { order } = await orderStoreRequest(env, "/orders/get", { orderId });
  if (!order) throw Object.assign(new Error("order_not_found"), { status: 404 });
  if (order.status === ORDER_STATUS.ACTIVE || order.status === ORDER_STATUS.PAYMENT_CAPTURED) {
    throw Object.assign(new Error("captured_order_cannot_be_denied"), { status: 409 });
  }

  if (order.status !== ORDER_STATUS.DENIED) {
    const response = await stripePost(
      `payment_intents/${encodeURIComponent(order.paymentIntentId)}/cancel`,
      new URLSearchParams(),
      env,
      `mackley-cancel-${orderId}`
    );
    const intent = await response.json();
    if (!response.ok && intent?.error?.code !== "payment_intent_unexpected_state") {
      throw new Error("authorization_cancel_failed");
    }
    await orderStoreRequest(env, "/orders/update", {
      orderId,
      patch: { status: ORDER_STATUS.DENIED, deniedAt: new Date().toISOString() },
      actor,
      reason: "provider_denied"
    });
    ({ order } = await orderStoreRequest(env, "/orders/get", { orderId }));
  }

  if (!order.denialEmailSentAt) {
    const email = await sendOrderStatusEmail(order, "denied", env);
    if (email.ok) {
      await orderStoreRequest(env, "/orders/update", {
        orderId,
        patch: { denialEmailSentAt: new Date().toISOString() }
      });
    }
  }
  return orderStoreRequest(env, "/orders/get", { orderId });
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin");
    const referer = request.headers.get("Referer");
    const inferredOrigin = origin ? null : inferOriginFromReferer(referer);
    const effectiveOrigin = isAllowedOrigin(origin)
      ? originFromHeader(origin)
      : inferredOrigin && isAllowedOrigin(inferredOrigin)
        ? inferredOrigin
        : null;

    const url = new URL(request.url);
    if (url.pathname === "/stripe/webhook") {
      if (request.method !== "POST") return jsonResponse(405, { error: "Method not allowed." });
      const rawBody = await request.text();
      const signature = request.headers.get("Stripe-Signature") || "";
      const secret = String(env.STRIPE_WEBHOOK_SECRET || "").trim();
      if (!secret) return jsonResponse(503, { error: "Stripe webhook is not configured." });
      if (!await verifyStripeSignature(rawBody, signature, secret)) {
        return jsonResponse(400, { error: "Invalid Stripe signature." });
      }

      const event = JSON.parse(rawBody);
      if (event.type === "checkout.session.completed") {
        const sessionId = sanitizeTrackingValue(event.data?.object?.id || "");
        if (sessionId) {
          const session = await retrieveCheckoutSession(sessionId, env);
          await persistCheckoutOrder(session, env);
        }
      }
      return jsonResponse(200, { received: true });
    }

    const providerActionMatch = url.pathname.match(/^\/api\/provider\/(approve|deny)\/([A-Za-z0-9_]+)$/);
    if (providerActionMatch) {
      if (request.method === "OPTIONS") {
        return new Response(null, {
          status: 204,
          headers: withCorsHeaders(new Headers(), effectiveOrigin || originFromHeader(origin), "POST, OPTIONS", "Content-Type, Authorization, X-Dashboard-Secret")
        });
      }
      if (request.method !== "POST") return jsonResponse(405, { error: "Method not allowed." }, effectiveOrigin);
      const identity = await authorizeOperator(request, env, ["owner", "provider"], {
        legacySecretNames: ["PROVIDER_ADMIN_SECRET", "DASHBOARD_SHARED_SECRET"]
      });
      if (!identity) return jsonResponse(403, { error: "Forbidden." }, effectiveOrigin);
      try {
        const orderId = providerActionMatch[2];
        const actor = { id: identity.sub, email: identity.email, role: identity.role };
        const result = providerActionMatch[1] === "approve"
          ? await approveProviderOrder(orderId, env, actor)
          : await denyProviderOrder(orderId, env, actor);
        return jsonResponse(200, { ok: true, ...result }, effectiveOrigin);
      } catch (error) {
        return jsonResponse(error.status || 500, { ok: false, error: error.message || "provider_action_failed" }, effectiveOrigin);
      }
    }

    if (url.pathname === "/api/provider/orders") {
      if (request.method === "OPTIONS") {
        return new Response(null, {
          status: 204,
          headers: withCorsHeaders(new Headers(), effectiveOrigin || originFromHeader(origin), "POST, OPTIONS", "Content-Type, Authorization, X-Dashboard-Secret")
        });
      }
      if (request.method !== "POST") return jsonResponse(405, { error: "Method not allowed." }, effectiveOrigin);
      const identity = await authorizeOperator(request, env, ["owner", "provider"], {
        legacySecretNames: ["PROVIDER_ADMIN_SECRET", "DASHBOARD_SHARED_SECRET"]
      });
      if (!identity) return jsonResponse(403, { error: "Forbidden." }, effectiveOrigin);
      try {
        const result = await orderStoreRequest(env, "/orders/list", {});
        return jsonResponse(200, result, effectiveOrigin);
      } catch (error) {
        return jsonResponse(500, { error: "provider_orders_failed" }, effectiveOrigin);
      }
    }

    if (url.pathname === "/social-proof") {
      const corsOrigin = corsOriginForSocialProof(origin || effectiveOrigin);
      if (request.method === "OPTIONS") {
        return new Response(null, {
          status: 204,
          headers: withCorsHeaders(new Headers(), corsOrigin)
        });
      }

      if (request.method !== "POST") {
        return jsonResponse(405, { error: "Method not allowed." }, corsOrigin);
      }

      let payload = null;
      try {
        payload = await request.json();
      } catch (error) {
        return jsonResponse(400, { error: "Invalid JSON." }, corsOrigin);
      }

      if (!payload || typeof payload !== "object") {
        return jsonResponse(400, { error: "Invalid payload." }, corsOrigin);
      }

      const type = payload.type;
      const page = payload.page;
      const totalMode = Boolean(payload.total);
      const windowSeconds = totalMode ? null : normalizeWindow(payload.window);
      if (!isValidProofType(type) || !isValidPage(page) || (!totalMode && !windowSeconds)) {
        return jsonResponse(400, { error: "Invalid payload." }, corsOrigin);
      }

      const record = Boolean(payload.record);
      const id = env.SOCIAL_PROOF.idFromName("social-proof");
      const stub = env.SOCIAL_PROOF.get(id);
      const response = await stub.fetch("https://social-proof", {
        method: "POST",
        body: JSON.stringify({
          key: `${type}:${page}`,
          window: windowSeconds,
          record,
          total: totalMode
        })
      });

      const data = await response.json();
      return jsonResponse(200, data, corsOrigin);
    }

    if (url.pathname === "/gif-performance") {
      const corsOrigin = corsOriginForSocialProof(origin || effectiveOrigin);
      if (request.method === "OPTIONS") {
        return new Response(null, {
          status: 204,
          headers: withCorsHeaders(new Headers(), corsOrigin)
        });
      }

      if (request.method !== "POST") {
        return jsonResponse(405, { error: "Method not allowed." }, corsOrigin);
      }

      let payload = null;
      try {
        payload = await request.json();
      } catch (error) {
        return jsonResponse(400, { error: "Invalid JSON." }, corsOrigin);
      }

      const pool = normalizeGifPool(payload?.pool);
      const event = ["rank", "watch", "advance"].includes(payload?.event) ? payload.event : "";
      const assets = Array.isArray(payload?.assets)
        ? payload.assets.map((asset) => normalizeGifAsset(asset, pool)).filter(Boolean).slice(0, 12)
        : [];
      const asset = normalizeGifAsset(payload?.asset, pool);
      const sessionId = sanitizeTrackingValue(payload?.sessionId || "").slice(0, 80);
      if (!pool || !event || !assets.length || (event !== "rank" && (!asset || !sessionId))) {
        return jsonResponse(400, { error: "Invalid payload." }, corsOrigin);
      }

      const id = env.SOCIAL_PROOF.idFromName("social-proof");
      const stub = env.SOCIAL_PROOF.get(id);
      const response = await stub.fetch("https://social-proof/gif-performance", {
        method: "POST",
        body: JSON.stringify({
          mode: "gif-performance",
          pool,
          event,
          assets,
          asset,
          sessionId
        })
      });
      const data = await response.json();
      return jsonResponse(response.status, data, corsOrigin);
    }

    if (url.pathname === "/analytics/collect") {
      if (!effectiveOrigin) {
        return jsonResponse(403, { error: "Origin not allowed." }, originFromHeader(origin));
      }

      if (request.method === "OPTIONS") {
        return new Response(null, {
          status: 204,
          headers: analyticsCorsHeaders(new Headers(), effectiveOrigin)
        });
      }

      if (request.method !== "POST") {
        return jsonResponse(405, { error: "Method not allowed." }, effectiveOrigin);
      }
      const response = await handleAnalyticsCollect(request, env);

      const payload = await response.text();
      const headers = analyticsCorsHeaders(new Headers(response.headers), effectiveOrigin);
      headers.set("Content-Type", "application/json");

      return new Response(payload, {
        status: response.status,
        headers
      });
    }

    if (url.pathname === "/ops/dashboard") {
      const responseOrigin = effectiveOrigin || originFromHeader(origin);
      if (request.method === "OPTIONS") {
        return new Response(null, {
          status: 204,
          headers: withCorsHeaders(
            new Headers(),
            responseOrigin,
            "POST, OPTIONS",
            "Content-Type, Authorization, X-Dashboard-Secret"
          )
        });
      }
      if (request.method !== "POST") {
        return jsonResponse(405, { error: "Method not allowed." }, responseOrigin);
      }

      const identity = await authorizeOperator(request, env, ["owner", "provider", "analyst", "support"], {
        legacySecretNames: ["PROVIDER_ADMIN_SECRET", "DASHBOARD_SHARED_SECRET"]
      });
      if (!identity) return jsonResponse(403, { error: "Forbidden." }, responseOrigin);

      const payload = await request.json().catch(() => ({}));
      const days = [7, 14, 30, 60, 90].includes(Number(payload.days)) ? Number(payload.days) : 14;
      try {
        const analyticsId = env.ANALYTICS_STORE.idFromName("analytics");
        const analyticsStub = env.ANALYTICS_STORE.get(analyticsId);
        const [analyticsResponse, orderResult] = await Promise.all([
          analyticsStub.fetch("https://analytics/dashboard", {
            method: "POST",
            body: JSON.stringify({ days })
          }),
          orderStoreRequest(env, "/orders/list", {})
        ]);
        const analyticsPayload = await analyticsResponse.json();
        const dashboard = buildOpsDashboard({
          analytics: analyticsPayload.dashboard || {},
          orderEntries: orderResult.orders || [],
          identity,
          days
        });
        const response = jsonResponse(200, { ok: true, dashboard }, responseOrigin);
        response.headers.set("Cache-Control", "no-store");
        return response;
      } catch (error) {
        return jsonResponse(500, { ok: false, error: "ops_dashboard_failed" }, responseOrigin);
      }
    }

    if (url.pathname === "/analytics/dashboard") {
      if (request.method === "OPTIONS") {
        return new Response(null, {
          status: 204,
          headers: analyticsCorsHeaders(new Headers(), effectiveOrigin || originFromHeader(origin))
        });
      }

      if (request.method !== "POST") {
        return jsonResponse(405, { error: "Method not allowed." }, effectiveOrigin || null);
      }

      const identity = await authorizeOperator(request, env, ["owner", "analyst"], {
        legacySecretNames: ["DASHBOARD_SHARED_SECRET"]
      });
      if (!identity) {
        return jsonResponse(403, { error: "Forbidden." }, effectiveOrigin || null);
      }

      const payload = await request.json().catch(() => ({}));
      const id = env.ANALYTICS_STORE.idFromName("analytics");
      const stub = env.ANALYTICS_STORE.get(id);
      const response = await stub.fetch("https://analytics/dashboard", {
        method: "POST",
        body: JSON.stringify(payload || {})
      });

      const body = await response.text();
      return new Response(body, {
        status: response.status,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store"
        }
      });
    }

    if (url.pathname === "/access-entry") {
      if (!effectiveOrigin) {
        return jsonResponse(403, { error: "Origin not allowed." }, originFromHeader(origin));
      }

      if (request.method === "OPTIONS") {
        return new Response(null, {
          status: 204,
          headers: analyticsCorsHeaders(new Headers(), effectiveOrigin)
        });
      }

      if (request.method !== "POST") {
        return jsonResponse(405, { error: "Method not allowed." }, effectiveOrigin);
      }

      const payload = await request.clone().json().catch(() => ({}));
      if (payload?.password !== normalizeAccessPassword(env.SITE_ACCESS_PASSWORD)) {
        return jsonResponse(403, { error: "Forbidden." }, effectiveOrigin);
      }

      const response = await handleAccessEntry(request, env);
      const body = await response.text();
      const headers = analyticsCorsHeaders(new Headers(response.headers), effectiveOrigin);
      headers.set("Content-Type", "application/json");
      return new Response(body, {
        status: response.status,
        headers
      });
    }

    if (url.pathname === "/access-request") {
      if (!effectiveOrigin) {
        return jsonResponse(403, { error: "Origin not allowed." }, originFromHeader(origin));
      }

      if (request.method === "OPTIONS") {
        return new Response(null, {
          status: 204,
          headers: analyticsCorsHeaders(new Headers(), effectiveOrigin)
        });
      }

      if (request.method !== "POST") {
        return jsonResponse(405, { error: "Method not allowed." }, effectiveOrigin);
      }

      const payload = await request.json().catch(() => ({}));
      const name = String(payload?.name || "").replace(/[\r\n]+/g, " ").trim().slice(0, 120);
      const email = normalizeEmail(payload?.email);
      if (name.length < 2 || !isValidEmail(email)) {
        return jsonResponse(400, { ok: false, error: "invalid_access_request" }, effectiveOrigin);
      }

      const emailResult = await sendAccessRequestEmail({ name, email }, payload || {}, env);
      if (!emailResult.ok) {
        return jsonResponse(500, { ok: false, error: emailResult.error }, effectiveOrigin);
      }

      return jsonResponse(202, { ok: true }, effectiveOrigin);
    }

    if (url.pathname === "/access-entries") {
      if (request.method === "OPTIONS") {
        return new Response(null, {
          status: 204,
          headers: analyticsCorsHeaders(new Headers(), effectiveOrigin || originFromHeader(origin))
        });
      }

      if (request.method !== "POST") {
        return jsonResponse(405, { error: "Method not allowed." }, effectiveOrigin || null);
      }

      const identity = await authorizeOperator(request, env, ["owner", "analyst"], {
        legacySecretNames: ["DASHBOARD_SHARED_SECRET"]
      });
      if (!identity) {
        return jsonResponse(403, { error: "Forbidden." }, effectiveOrigin || null);
      }

      const response = await handleAccessEntries(request, env);
      const body = await response.text();
      const headers = analyticsCorsHeaders(new Headers(response.headers), effectiveOrigin || originFromHeader(origin));
      headers.set("Content-Type", "application/json");
      headers.set("Cache-Control", "no-store");
      return new Response(body, {
        status: response.status,
        headers
      });
    }

    if (url.pathname.startsWith("/referrals/")) {
      const referralIdentity = url.pathname === "/referrals/redeem"
        ? await authorizeOperator(request, env, ["owner", "support"], {
          legacySecretNames: ["REFERRAL_ADMIN_SECRET", "DASHBOARD_SHARED_SECRET"]
        })
        : null;
      const adminReferralRequest = Boolean(referralIdentity);
      if (!effectiveOrigin && !adminReferralRequest) {
        return jsonResponse(403, { error: "Origin not allowed." }, originFromHeader(origin));
      }

      if (request.method === "OPTIONS") {
        return new Response(null, {
          status: 204,
          headers: withCorsHeaders(new Headers(), effectiveOrigin || originFromHeader(origin))
        });
      }

      if (request.method !== "POST") {
        return jsonResponse(405, { error: "Method not allowed." }, effectiveOrigin);
      }

      if (!env.REFERRAL_STORE) {
        return jsonResponse(503, { error: "Referral store is not configured." }, effectiveOrigin);
      }

      const payload = await request.json().catch(() => ({}));
      const id = env.REFERRAL_STORE.idFromName("referrals");
      const stub = env.REFERRAL_STORE.get(id);
      const response = await stub.fetch(`https://referrals${url.pathname}`, {
        method: "POST",
        body: JSON.stringify({
          ...(payload || {}),
          requestOrigin: effectiveOrigin,
          adminAuthorized: adminReferralRequest
        })
      });
      const body = await response.text();
      const headers = withCorsHeaders(new Headers(response.headers), effectiveOrigin || originFromHeader(origin));
      headers.set("Content-Type", "application/json");
      headers.set("Cache-Control", "no-store");
      return new Response(body, {
        status: response.status,
        headers
      });
    }

    if (!effectiveOrigin) {
      return jsonResponse(403, { error: "Origin not allowed." }, originFromHeader(origin));
    }

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: withCorsHeaders(new Headers(), effectiveOrigin)
      });
    }

    if (request.method !== "POST") {
      return jsonResponse(405, { error: "Method not allowed." }, effectiveOrigin);
    }

    let payload = null;
    try {
      payload = await request.json();
    } catch (error) {
      return jsonResponse(400, { error: "Invalid JSON." }, effectiveOrigin);
    }

    if (url.pathname === "/create-payment-intent") {
      return jsonResponse(410, { error: "Legacy payment intents are disabled. Use provider review checkout." }, effectiveOrigin);
    }

    if (url.pathname === "/provider-requests") {
      const validationError = validateProviderRequestBody(payload);
      if (validationError) return jsonResponse(400, { error: validationError }, effectiveOrigin);
      try {
        const requestId = createPublicId("req");
        const verificationToken = createPublicId("verify");
        const verificationTokenHash = await sha256Hex(verificationToken);
        const result = await orderStoreRequest(env, "/requests/create", {
          requestId,
          request: {
            ...payload,
            email: normalizeEmail(payload.email),
            status: ORDER_STATUS.PENDING,
            emailVerifiedAt: null,
            verificationTokenHash,
            verificationExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
            submittedAt: new Date().toISOString()
          }
        });
        const verificationEmail = await sendEmailVerification({
          name: payload.fullName,
          email: payload.email
        }, requestId, verificationToken, env);
        return jsonResponse(201, {
          ...result,
          verificationEmailSent: verificationEmail.ok
        }, effectiveOrigin);
      } catch (error) {
        return jsonResponse(500, { error: "provider_request_failed" }, effectiveOrigin);
      }
    }

    if (url.pathname === "/provider-requests/verify-email") {
      const token = sanitizeTrackingValue(payload?.token || "");
      if (!token) return jsonResponse(400, { error: "Verification token is required." }, effectiveOrigin);
      try {
        const tokenHash = await sha256Hex(token);
        const result = await orderStoreRequest(env, "/requests/verify-email", { tokenHash });
        return jsonResponse(result.verified ? 200 : 400, result, effectiveOrigin);
      } catch (error) {
        return jsonResponse(400, { verified: false, error: "email_verification_failed" }, effectiveOrigin);
      }
    }

    if (url.pathname === "/create-checkout-session") {
      const validationError = validateCheckoutSessionBody(payload);
      if (validationError) {
        return jsonResponse(400, { error: validationError }, effectiveOrigin);
      }

      try {
        const requestId = sanitizeTrackingValue(payload.requestId);
        const stored = await orderStoreRequest(env, "/requests/get", { requestId });
        if (!stored.request || normalizeEmail(stored.request.email) !== normalizeEmail(payload.email)) {
          return jsonResponse(404, { error: "Provider request not found." }, effectiveOrigin);
        }
        const orderId = createPublicId("ord");
        const checkoutPayload = { ...payload, orderId, requestId };
        const response = await stripePost(
          "checkout/sessions",
          buildCheckoutSessionParams(checkoutPayload),
          env,
          `mackley-checkout-${orderId}`
        );
        const data = await response.json();
        const checkoutReady = payload.embedded ? Boolean(data.client_secret) : Boolean(data.url);
        if (!response.ok || !checkoutReady || !data.id) {
          return jsonResponse(500, { error: "Stripe checkout error." }, effectiveOrigin);
        }

        await orderStoreRequest(env, "/orders/upsert", {
          order: {
            orderId,
            requestId,
            checkoutSessionId: data.id,
            customerEmail: normalizeEmail(payload.email),
            status: "AWAITING_AUTHORIZATION",
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          }
        });

        return jsonResponse(200, {
          orderId,
          sessionId: data.id,
          url: data.url || null,
          clientSecret: data.client_secret || null
        }, effectiveOrigin);
      } catch (error) {
        return jsonResponse(500, { error: "Stripe checkout error." }, effectiveOrigin);
      }
    }

    if (url.pathname === "/verify-checkout-session") {
      const sessionId = sanitizeTrackingValue(payload?.sessionId);
      if (!sessionId) {
        return jsonResponse(400, { error: "Session id is required." }, effectiveOrigin);
      }

      try {
        const data = await retrieveCheckoutSession(sessionId, env);
        const stored = await persistCheckoutOrder(data, env);

        const paymentIntentId = typeof data.payment_intent === "string"
          ? data.payment_intent
          : data.payment_intent && typeof data.payment_intent === "object"
            ? data.payment_intent.id
            : null;
        const intentStatus = typeof data.payment_intent === "object" ? data.payment_intent.status : null;
        const verified = data.status === "complete" && intentStatus === "requires_capture";

        return jsonResponse(200, {
          amountTotal: Number.isFinite(data.amount_total) ? data.amount_total : 0,
          currency: typeof data.currency === "string" ? data.currency : "usd",
          customerEmail: data.customer_details?.email || data.customer_email || null,
          paymentIntentId,
          orderId: stored.order?.orderId || null,
          orderStatus: stored.order?.status || ORDER_STATUS.PENDING,
          paymentStatus: data.payment_status || null,
          sessionId: data.id,
          status: data.status || null,
          verified
        }, effectiveOrigin);
      } catch (error) {
        return jsonResponse(500, { error: "Stripe checkout error." }, effectiveOrigin);
      }
    }

    return jsonResponse(404, { error: "Not found." }, effectiveOrigin);
  }
};

export class SocialProof {
  constructor(state) {
    this.state = state;
  }

  async fetch(request) {
    if (request.method !== "POST") {
      return new Response("Method not allowed.", { status: 405 });
    }

    let payload = null;
    try {
      payload = await request.json();
    } catch (error) {
      return new Response("Invalid JSON.", { status: 400 });
    }

    if (payload?.mode === "gif-performance") {
      return this.gifPerformance(payload);
    }

    const key = payload?.key;
    const totalMode = Boolean(payload?.total);
    const windowSeconds = totalMode ? null : normalizeWindow(payload?.window);
    const record = Boolean(payload?.record);
    if (typeof key !== "string" || (!totalMode && !windowSeconds)) {
      return new Response("Invalid payload.", { status: 400 });
    }

    if (totalMode) {
      const stored = await this.state.storage.get(key);
      const current = Number.isFinite(stored) ? stored : 0;
      const next = record ? current + 1 : current;
      await this.state.storage.put(key, next);
      return new Response(JSON.stringify({ count: next }), {
        headers: {
          "Content-Type": "application/json"
        }
      });
    }

    const now = Date.now();
    const cutoff = now - windowSeconds * 1000;
    const stored = await this.state.storage.get(key);
    const events = Array.isArray(stored) ? stored : [];
    const fresh = events.filter((timestamp) => typeof timestamp === "number" && timestamp >= cutoff);

    if (record) {
      fresh.push(now);
    }

    const trimmed = fresh.slice(-5000);
    await this.state.storage.put(key, trimmed);

    return new Response(JSON.stringify({ count: trimmed.length }), {
      headers: {
        "Content-Type": "application/json"
      }
    });
  }

  async gifPerformance(payload) {
    const pool = normalizeGifPool(payload?.pool);
    const event = ["rank", "watch", "advance"].includes(payload?.event) ? payload.event : "";
    const assets = Array.isArray(payload?.assets)
      ? payload.assets.map((asset) => normalizeGifAsset(asset, pool)).filter(Boolean).slice(0, 12)
      : [];
    const asset = normalizeGifAsset(payload?.asset, pool);
    const sessionId = sanitizeTrackingValue(payload?.sessionId || "").slice(0, 80);
    if (!pool || !event || !assets.length || (event !== "rank" && (!asset || !sessionId))) {
      return new Response(JSON.stringify({ error: "Invalid payload." }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }

    const statsKey = `gif-performance:${pool}`;
    const stored = await this.state.storage.get(statsKey);
    const stats = stored && typeof stored === "object" ? stored : {};

    if (event !== "rank") {
      const dedupeKey = `gif-session:${pool}:${sessionId}:${asset}`;
      const dedupe = await this.state.storage.get(dedupeKey) || {};
      if (!dedupe[event]) {
        const current = stats[asset] || { watches: 0, advances: 0 };
        current[event === "watch" ? "watches" : "advances"] += 1;
        stats[asset] = current;
        dedupe[event] = Date.now();
        await this.state.storage.put(dedupeKey, dedupe);
        await this.state.storage.put(statsKey, stats);
      }
    }

    const ranking = assets.map((candidate) => {
      const candidateStats = stats[candidate] || { watches: 0, advances: 0 };
      const watches = Number(candidateStats.watches) || 0;
      const advances = Number(candidateStats.advances) || 0;
      const completionRate = (advances + 1) / (watches + 2);
      const confidence = Math.min(1, Math.log2(watches + 1) / 5);
      return {
        asset: candidate,
        watches,
        advances,
        score: 1 + (completionRate * confidence * 4)
      };
    }).sort((a, b) => b.score - a.score || b.advances - a.advances || b.watches - a.watches);

    return new Response(JSON.stringify({ ranking }), {
      headers: { "Content-Type": "application/json" }
    });
  }
}

const REFERRAL_RECEIVER_PERCENT = 10;
const REFERRAL_SHARER_PERCENT = 10;
const REFERRAL_MAX_TOTAL_PERCENT = 20;
const REFERRAL_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function referralJson(status, data) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store"
    }
  });
}

function normalizeReferralName(value) {
  return String(value || "").replace(/[\r\n]+/g, " ").trim().slice(0, 120);
}

function randomReferralToken(length = 8) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => REFERRAL_ALPHABET[byte % REFERRAL_ALPHABET.length]).join("");
}

function displayReferralCode(code) {
  const normalized = normalizeReferralCode(code);
  if (normalized.length <= 3) return normalized;
  return `${normalized.slice(0, 3)}-${normalized.slice(3)}`;
}

async function sha256Hex(value) {
  const encoded = new TextEncoder().encode(String(value || ""));
  const digest = await crypto.subtle.digest("SHA-256", encoded);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function hashReferralEmail(email) {
  return sha256Hex(normalizeEmail(email));
}

export class ReferralStore {
  constructor(state) {
    this.state = state;
  }

  async createActor(payload) {
    const email = normalizeEmail(payload?.email);
    const fullName = normalizeReferralName(payload?.fullName || payload?.name);
    if (!isValidEmail(email)) {
      return referralJson(400, { ok: false, error: "valid_email_required" });
    }

    const emailHash = await hashReferralEmail(email);
    const emailKey = `email:${emailHash}`;
    const existingActorId = await this.state.storage.get(emailKey);
    if (existingActorId) {
      const existing = await this.state.storage.get(`actor:${existingActorId}`);
      if (existing) {
        return referralJson(200, {
          ok: true,
          actorUserId: existing.actorUserId,
          referralCode: existing.code,
          displayCode: existing.displayCode,
          loopId: `loop-${randomReferralToken(10).toLowerCase()}`,
          receiverOfferPercent: REFERRAL_RECEIVER_PERCENT,
          sharerRewardPercent: REFERRAL_SHARER_PERCENT,
          maxTotalPercent: REFERRAL_MAX_TOTAL_PERCENT,
          reused: true
        });
      }
    }

    let code = "";
    for (let attempt = 0; attempt < 12; attempt += 1) {
      code = `MCK${randomReferralToken(6)}`;
      const taken = await this.state.storage.get(`code:${code}`);
      if (!taken) break;
      code = "";
    }

    if (!code) {
      return referralJson(500, { ok: false, error: "code_generation_failed" });
    }

    const actorUserId = `mk-${randomReferralToken(12).toLowerCase()}`;
    const actor = {
      actorUserId,
      emailHash,
      fullName,
      code,
      displayCode: displayReferralCode(code),
      createdAt: new Date().toISOString(),
      pendingClaims: 0,
      redeemedClaims: 0,
      rewardPercentAvailable: 0,
      maxTotalPercent: REFERRAL_MAX_TOTAL_PERCENT
    };

    await this.state.storage.put(emailKey, actorUserId);
    await this.state.storage.put(`actor:${actorUserId}`, actor);
    await this.state.storage.put(`code:${code}`, actorUserId);

    return referralJson(201, {
      ok: true,
      actorUserId,
      referralCode: code,
      displayCode: actor.displayCode,
      loopId: `loop-${randomReferralToken(10).toLowerCase()}`,
      receiverOfferPercent: REFERRAL_RECEIVER_PERCENT,
      sharerRewardPercent: REFERRAL_SHARER_PERCENT,
      maxTotalPercent: REFERRAL_MAX_TOTAL_PERCENT,
      reused: false
    });
  }

  async resolveReferrer(payload) {
    const directActorId = normalizeToken(payload?.referrerUserId);
    const code = normalizeReferralCode(payload?.referralCode || payload?.code);

    if (directActorId) {
      const actor = await this.state.storage.get(`actor:${directActorId}`);
      if (actor) return actor;
    }

    if (code) {
      const actorUserId = await this.state.storage.get(`code:${code}`);
      if (actorUserId) {
        const actor = await this.state.storage.get(`actor:${actorUserId}`);
        if (actor) return actor;
      }
    }

    return null;
  }

  async claim(payload) {
    const claimantEmail = normalizeEmail(payload?.claimantEmail || payload?.email);
    const claimantName = normalizeReferralName(payload?.claimantName || payload?.fullName || payload?.name);
    if (!isValidEmail(claimantEmail)) {
      return referralJson(400, { ok: false, error: "valid_claimant_email_required" });
    }

    const referrer = await this.resolveReferrer(payload);
    if (!referrer) {
      return referralJson(200, {
        ok: false,
        accepted: false,
        reason: "invalid_referral",
        message: "Referral code not found."
      });
    }

    const claimantEmailHash = await hashReferralEmail(claimantEmail);
    if (claimantEmailHash === referrer.emailHash) {
      return referralJson(200, {
        ok: false,
        accepted: false,
        reason: "self_referral",
        message: "Referral codes cannot be used on your own survey."
      });
    }

    const recipientKey = `recipient:${claimantEmailHash}`;
    const existingClaimId = await this.state.storage.get(recipientKey);
    if (existingClaimId) {
      const existing = await this.state.storage.get(`claim:${existingClaimId}`);
      return referralJson(200, {
        ok: true,
        accepted: false,
        reason: "already_claimed",
        message: "A referral offer is already linked to this email.",
        claim: existing || null
      });
    }

    const loopId = normalizeToken(payload?.loopId || payload?.loop) || `loop-${randomReferralToken(10).toLowerCase()}`;
    const shareDepth = Math.max(0, Math.min(Number(payload?.shareDepth || payload?.depth || 0) || 0, 12));
    const claimId = `claim-${randomReferralToken(14).toLowerCase()}`;
    const claim = {
      claimId,
      referrerActorId: referrer.actorUserId,
      referrerCode: referrer.code,
      claimantEmailHash,
      claimantName,
      loopId,
      receiverOfferPercent: REFERRAL_RECEIVER_PERCENT,
      sharerRewardPercent: REFERRAL_SHARER_PERCENT,
      maxTotalPercent: REFERRAL_MAX_TOTAL_PERCENT,
      status: "pending_provider_approval",
      shareDepth,
      createdAt: new Date().toISOString(),
      redeemedAt: ""
    };

    referrer.pendingClaims = Number(referrer.pendingClaims || 0) + 1;
    await this.state.storage.put(`actor:${referrer.actorUserId}`, referrer);
    await this.state.storage.put(recipientKey, claimId);
    await this.state.storage.put(`claim:${claimId}`, claim);

    return referralJson(201, {
      ok: true,
      accepted: true,
      claim,
      message: "Referral accepted."
    });
  }

  async findClaim(payload) {
    const claimId = normalizeToken(payload?.claimId || payload?.claim_id);
    if (claimId) {
      const claim = await this.state.storage.get(`claim:${claimId}`);
      if (claim) return claim;
    }

    const claimantEmail = normalizeEmail(payload?.claimantEmail || payload?.email);
    if (isValidEmail(claimantEmail)) {
      const claimantEmailHash = await hashReferralEmail(claimantEmail);
      const storedClaimId = await this.state.storage.get(`recipient:${claimantEmailHash}`);
      if (storedClaimId) {
        const claim = await this.state.storage.get(`claim:${storedClaimId}`);
        if (claim) return claim;
      }
    }

    return null;
  }

  async redeem(payload) {
    if (!payload?.adminAuthorized) {
      return referralJson(403, { ok: false, error: "forbidden" });
    }

    const claim = await this.findClaim(payload);
    if (!claim) {
      return referralJson(404, { ok: false, error: "claim_not_found" });
    }

    const orderId = normalizeToken(payload?.orderId || payload?.order_id || payload?.paymentIntentId || payload?.sessionId);
    if (!orderId) {
      return referralJson(400, { ok: false, error: "order_id_required" });
    }

    const existingOrderClaimId = await this.state.storage.get(`order:${orderId}`);
    if (existingOrderClaimId && existingOrderClaimId !== claim.claimId) {
      return referralJson(409, { ok: false, error: "order_already_redeemed" });
    }

    const referralCode = normalizeReferralCode(payload?.referralCode || payload?.code || "");
    if (referralCode && referralCode !== claim.referrerCode) {
      return referralJson(409, { ok: false, error: "referral_code_mismatch" });
    }

    const actor = await this.state.storage.get(`actor:${claim.referrerActorId}`);
    if (!actor) {
      return referralJson(404, { ok: false, error: "referrer_not_found" });
    }

    if (claim.status === "redeemed") {
      return referralJson(200, {
        ok: true,
        redeemed: false,
        idempotent: true,
        claim,
        referrerRewardPercentAvailable: Number(actor.rewardPercentAvailable || 0),
        message: "Referral reward was already redeemed."
      });
    }

    const now = new Date().toISOString();
    claim.status = "redeemed";
    claim.orderId = orderId;
    claim.providerApprovedAt = normalizeReferralName(payload?.providerApprovedAt || payload?.approvedAt) || now;
    claim.redeemedAt = now;

    actor.pendingClaims = Math.max(0, Number(actor.pendingClaims || 0) - 1);
    actor.redeemedClaims = Number(actor.redeemedClaims || 0) + 1;
    actor.rewardPercentAvailable = Math.min(
      Number(actor.maxTotalPercent || REFERRAL_MAX_TOTAL_PERCENT),
      Number(actor.rewardPercentAvailable || 0) + Number(claim.sharerRewardPercent || REFERRAL_SHARER_PERCENT)
    );
    actor.updatedAt = now;

    await this.state.storage.put(`claim:${claim.claimId}`, claim);
    await this.state.storage.put(`actor:${actor.actorUserId}`, actor);
    await this.state.storage.put(`order:${orderId}`, claim.claimId);
    await this.state.storage.put(`reward:${actor.actorUserId}:${claim.claimId}`, {
      actorUserId: actor.actorUserId,
      claimId: claim.claimId,
      orderId,
      percent: Number(claim.sharerRewardPercent || REFERRAL_SHARER_PERCENT),
      createdAt: now
    });

    return referralJson(200, {
      ok: true,
      redeemed: true,
      claim,
      receiverOfferPercent: Number(claim.receiverOfferPercent || REFERRAL_RECEIVER_PERCENT),
      sharerRewardPercent: Number(claim.sharerRewardPercent || REFERRAL_SHARER_PERCENT),
      referrerRewardPercentAvailable: actor.rewardPercentAvailable,
      message: "Referral reward unlocked."
    });
  }

  async fetch(request) {
    if (request.method !== "POST") {
      return referralJson(405, { ok: false, error: "method_not_allowed" });
    }

    const payload = await request.json().catch(() => ({}));
    const url = new URL(request.url);

    if (url.pathname === "/referrals/create") {
      return this.createActor(payload);
    }

    if (url.pathname === "/referrals/claim") {
      return this.claim(payload);
    }

    if (url.pathname === "/referrals/redeem") {
      return this.redeem(payload);
    }

    return referralJson(404, { ok: false, error: "not_found" });
  }
}

export class OrderStore {
  constructor(state) {
    this.state = state;
  }

  response(status, data) {
    return new Response(JSON.stringify(data), {
      status,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store"
      }
    });
  }

  async appendAudit(orderId, input) {
    const key = `audit:${orderId}`;
    const history = await this.state.storage.get(key) || [];
    history.unshift({
      id: crypto.randomUUID(),
      at: new Date().toISOString(),
      action: String(input.action || "order_updated").slice(0, 80),
      fromStatus: input.fromStatus || null,
      toStatus: input.toStatus || null,
      reason: String(input.reason || "").slice(0, 160),
      actor: {
        id: String(input.actor?.id || "system").slice(0, 160),
        email: String(input.actor?.email || "").toLowerCase().slice(0, 200),
        role: String(input.actor?.role || "system").slice(0, 40)
      }
    });
    await this.state.storage.put(key, history.slice(0, 200));
    return history;
  }

  async fetch(request) {
    if (request.method !== "POST") return this.response(405, { error: "method_not_allowed" });
    const payload = await request.json().catch(() => ({}));
    const url = new URL(request.url);

    if (url.pathname === "/requests/create") {
      const requestId = sanitizeTrackingValue(payload.requestId);
      if (!requestId || !payload.request || typeof payload.request !== "object") {
        return this.response(400, { error: "invalid_provider_request" });
      }
      await this.state.storage.put(`request:${requestId}`, payload.request);
      if (payload.request.verificationTokenHash) {
        await this.state.storage.put(`verification:${payload.request.verificationTokenHash}`, requestId);
      }
      return this.response(201, { requestId });
    }

    if (url.pathname === "/requests/get") {
      const requestId = sanitizeTrackingValue(payload.requestId);
      const providerRequest = requestId ? await this.state.storage.get(`request:${requestId}`) : null;
      return this.response(200, { request: providerRequest || null });
    }

    if (url.pathname === "/requests/verify-email") {
      const tokenHash = sanitizeTrackingValue(payload.tokenHash);
      const requestId = tokenHash ? await this.state.storage.get(`verification:${tokenHash}`) : null;
      const providerRequest = requestId ? await this.state.storage.get(`request:${requestId}`) : null;
      if (!providerRequest) return this.response(400, { verified: false, error: "invalid_token" });
      if (providerRequest.emailVerifiedAt) {
        return this.response(200, { verified: true, requestId, emailVerifiedAt: providerRequest.emailVerifiedAt });
      }
      if (!providerRequest.verificationExpiresAt || Date.parse(providerRequest.verificationExpiresAt) < Date.now()) {
        return this.response(400, { verified: false, error: "expired_token" });
      }
      const emailVerifiedAt = new Date().toISOString();
      await this.state.storage.put(`request:${requestId}`, {
        ...providerRequest,
        emailVerifiedAt,
        verificationTokenHash: null
      });
      await this.state.storage.delete(`verification:${tokenHash}`);
      return this.response(200, { verified: true, requestId, emailVerifiedAt });
    }

    if (url.pathname === "/orders/upsert") {
      const incoming = payload.order && typeof payload.order === "object" ? payload.order : null;
      const orderId = sanitizeTrackingValue(incoming?.orderId || "");
      if (!incoming || !orderId) return this.response(400, { error: "invalid_order" });
      const existing = await this.state.storage.get(`order:${orderId}`) || {};
      const requestedStatus = incoming.status || existing.status;
      if (requestedStatus && !isOrderStatus(requestedStatus)) {
        return this.response(400, { error: "invalid_order_status" });
      }
      try {
        assertOrderTransition(existing.status, requestedStatus);
      } catch (error) {
        return this.response(409, { error: error.message });
      }
      if (isTerminalOrderStatus(existing.status) && requestedStatus !== existing.status) {
        return this.response(409, { error: "terminal_order_cannot_change" });
      }
      const order = {
        ...existing,
        ...incoming,
        status: requestedStatus,
        createdAt: existing.createdAt || incoming.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      await this.state.storage.put(`order:${orderId}`, order);
      if (!existing.orderId || existing.status !== order.status) {
        await this.appendAudit(orderId, {
          action: existing.orderId ? "status_changed" : "order_created",
          fromStatus: existing.status,
          toStatus: order.status,
          reason: payload.reason || (existing.orderId ? "order_upsert" : "checkout_completed"),
          actor: payload.actor
        });
      }
      if (order.checkoutSessionId) await this.state.storage.put(`session:${order.checkoutSessionId}`, orderId);
      const orderIds = await this.state.storage.get("order:index") || [];
      if (!orderIds.includes(orderId)) {
        orderIds.unshift(orderId);
        await this.state.storage.put("order:index", orderIds.slice(0, 1000));
      }
      return this.response(200, { order });
    }

    if (url.pathname === "/orders/get") {
      let orderId = sanitizeTrackingValue(payload.orderId || "");
      if (!orderId && payload.checkoutSessionId) {
        orderId = await this.state.storage.get(`session:${sanitizeTrackingValue(payload.checkoutSessionId)}`) || "";
      }
      const order = orderId ? await this.state.storage.get(`order:${orderId}`) : null;
      return this.response(200, { order: order || null });
    }

    if (url.pathname === "/orders/update") {
      const orderId = sanitizeTrackingValue(payload.orderId);
      const patch = payload.patch && typeof payload.patch === "object" ? payload.patch : null;
      const existing = orderId ? await this.state.storage.get(`order:${orderId}`) : null;
      if (!existing || !patch) return this.response(404, { error: "order_not_found" });
      if (patch.status && !isOrderStatus(patch.status)) {
        return this.response(400, { error: "invalid_order_status" });
      }
      try {
        assertOrderTransition(existing.status, patch.status || existing.status);
      } catch (error) {
        return this.response(409, { error: error.message });
      }
      const order = { ...existing, ...patch, orderId, updatedAt: new Date().toISOString() };
      await this.state.storage.put(`order:${orderId}`, order);
      if (existing.status !== order.status) {
        await this.appendAudit(orderId, {
          action: "status_changed",
          fromStatus: existing.status,
          toStatus: order.status,
          reason: payload.reason || "order_update",
          actor: payload.actor
        });
      }
      return this.response(200, { order });
    }

    if (url.pathname === "/orders/audit") {
      const orderId = sanitizeTrackingValue(payload.orderId);
      const audit = orderId ? await this.state.storage.get(`audit:${orderId}`) : null;
      return this.response(200, { audit: audit || [] });
    }

    if (url.pathname === "/orders/list") {
      const orderIds = await this.state.storage.get("order:index") || [];
      const orders = (await Promise.all(orderIds.map((orderId) => this.state.storage.get(`order:${orderId}`))))
        .filter(Boolean);
      const requests = await Promise.all(orders.map((order) => this.state.storage.get(`request:${order.requestId}`)));
      const audits = await Promise.all(orders.map((order) => this.state.storage.get(`audit:${order.orderId}`)));
      return this.response(200, {
        orders: orders.map((order, index) => ({
          order,
          request: requests[index] || null,
          audit: audits[index] || []
        }))
      });
    }

    return this.response(404, { error: "not_found" });
  }
}

export { AnalyticsStore };
