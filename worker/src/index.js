import {
  AnalyticsStore,
  analyticsCorsHeaders,
  handleAccessEntries,
  handleAccessEntry,
  handleAnalyticsCollect
} from "./analytics.js";

const ALLOWED_HOSTS = new Set([
  "whoismackley.com",
  "whoismackley.com:443",
  "www.whoismackley.com",
  "www.whoismackley.com:443",
  "mackley.co",
  "mackley.co:443",
  "www.mackley.co",
  "www.mackley.co:443",
  "mackleyco.vercel.app",
  "mackley.vercel.app",
  "localhost:3000",
  "localhost:5173",
  "127.0.0.1:8017",
  "127.0.0.1:5500"
]);

const CLICK_TRACKING_KEYS = ["gclid", "gclsrc", "wbraid", "gbraid"];
const CHECKOUT_SUCCESS_URL = "https://whoismackley.com/thank-you?session_id={CHECKOUT_SESSION_ID}";
const CHECKOUT_CANCEL_URL = "https://whoismackley.com/checkout";
const PRODUCT_NAME = "Intranasal Neuropeptide Formula";
const PRODUCT_ID = "prod_UgF2SFTaA6cCVy";
const PRODUCT_SKU = "INF-01";
const PRODUCT_UNIT_AMOUNT = 3000;

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

function normalizeDashboardSecret(value) {
  const next = String(value || "").trim();
  return next || "BreatheDeeper";
}

function readDashboardAuthorization(request) {
  const header = request.headers.get("authorization") || request.headers.get("x-dashboard-secret") || "";
  if (header.toLowerCase().startsWith("bearer ")) {
    return header.slice(7).trim();
  }
  return header.trim();
}

function jsonResponse(status, data, origin) {
  const headers = {
    "Content-Type": "application/json"
  };
  if (origin) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Vary"] = "Origin";
  }
  return new Response(JSON.stringify(data), { status, headers });
}

function withCorsHeaders(headers, origin, methods = "POST, OPTIONS", allowedHeaders = "Content-Type") {
  if (!origin) return headers;
  headers.set("Access-Control-Allow-Origin", origin);
  headers.set("Access-Control-Allow-Methods", methods);
  headers.set("Access-Control-Allow-Headers", allowedHeaders);
  headers.set("Vary", "Origin");
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

  return null;
}

function normalizeAccessPassword(value) {
  const next = String(value || "").trim();
  return next || "jumpthegap";
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase().slice(0, 160);
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

  const from = String(env.ACCESS_EMAIL_FROM || "MACKLEY <access@mackley.co>").trim();
  const notifyTo = String(env.ACCESS_REQUEST_NOTIFY_TO || "contact@mackley.co").trim();
  const password = normalizeAccessPassword(env.SITE_ACCESS_PASSWORD);
  const pageUrl = String(requestInfo.page_url || "").slice(0, 260);
  const referrer = String(requestInfo.referrer || "").slice(0, 260);
  const language = String(requestInfo.language || "-").slice(0, 40);
  const timezone = String(requestInfo.timezone || "-").slice(0, 80);
  const htmlName = escapeHtml(profile.name);
  const htmlEmail = escapeHtml(profile.email);
  const htmlPassword = escapeHtml(password);
  const htmlPageUrl = escapeHtml(pageUrl || "/");
  const htmlReferrer = escapeHtml(referrer || "-");
  const htmlLanguage = escapeHtml(language);
  const htmlTimezone = escapeHtml(timezone);
  const text = [
    "New MACKLEY access request",
    "",
    `Name: ${profile.name}`,
    `Email: ${profile.email}`,
    `Password to share: ${password}`,
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
          <li><strong>Password to share:</strong> ${htmlPassword}</li>
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
  return type === "view" || type === "purchase";
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

async function stripePost(path, params, env) {
  return fetch(`https://api.stripe.com/v1/${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
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

  return params;
}

function buildCheckoutSessionParams(payload) {
  const quantity = normalizeQuantity(payload.quantity);
  const tracking = normalizeTracking(payload);
  const params = new URLSearchParams();

  params.set("mode", "payment");
  params.set("success_url", CHECKOUT_SUCCESS_URL);
  params.set("cancel_url", CHECKOUT_CANCEL_URL);
  params.set("line_items[0][price_data][currency]", "usd");
  params.set("line_items[0][price_data][product]", PRODUCT_ID);
  params.set("line_items[0][price_data][unit_amount]", String(PRODUCT_UNIT_AMOUNT));
  params.set("line_items[0][quantity]", String(quantity));
  params.set("billing_address_collection", "auto");
  params.set("shipping_address_collection[allowed_countries][0]", "US");
  params.set("metadata[product]", PRODUCT_NAME);
  params.set("metadata[product_id]", PRODUCT_ID);
  params.set("metadata[sku]", PRODUCT_SKU);
  params.set("metadata[quantity]", String(quantity));
  params.set("payment_intent_data[metadata][product]", PRODUCT_NAME);
  params.set("payment_intent_data[metadata][product_id]", PRODUCT_ID);
  params.set("payment_intent_data[metadata][sku]", PRODUCT_SKU);
  params.set("payment_intent_data[metadata][quantity]", String(quantity));

  Object.entries(tracking).forEach(([key, value]) => {
    params.set(`metadata[${key}]`, value);
    params.set(`payment_intent_data[metadata][${key}]`, value);
  });

  return params;
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

      const providedSecret = readDashboardAuthorization(request);
      const expectedSecret = normalizeDashboardSecret(env.DASHBOARD_SHARED_SECRET);
      if (!providedSecret || providedSecret !== expectedSecret) {
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

      const providedSecret = readDashboardAuthorization(request);
      const expectedSecret = normalizeDashboardSecret(env.DASHBOARD_SHARED_SECRET);
      if (!providedSecret || providedSecret !== expectedSecret) {
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
      const validationError = validatePaymentIntentBody(payload);
      if (validationError) {
        return jsonResponse(400, { error: validationError }, effectiveOrigin);
      }

      try {
        const response = await stripePost("payment_intents", buildPaymentIntentParams(payload), env);
        const data = await response.json();
        if (!response.ok || !data.client_secret) {
          return jsonResponse(500, { error: "Stripe error." }, effectiveOrigin);
        }

        return jsonResponse(200, { clientSecret: data.client_secret }, effectiveOrigin);
      } catch (error) {
        return jsonResponse(500, { error: "Stripe error." }, effectiveOrigin);
      }
    }

    if (url.pathname === "/create-checkout-session") {
      const validationError = validateCheckoutSessionBody(payload);
      if (validationError) {
        return jsonResponse(400, { error: validationError }, effectiveOrigin);
      }

      try {
        const response = await stripePost("checkout/sessions", buildCheckoutSessionParams(payload), env);
        const data = await response.json();
        if (!response.ok || !data.url || !data.id) {
          return jsonResponse(500, { error: "Stripe checkout error." }, effectiveOrigin);
        }

        return jsonResponse(200, {
          sessionId: data.id,
          url: data.url
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
        const encodedSessionId = encodeURIComponent(sessionId);
        const stripePath = `checkout/sessions/${encodedSessionId}?expand[]=payment_intent`;
        const response = await stripeGet(stripePath, env);
        const data = await response.json();
        if (!response.ok || !data.id) {
          return jsonResponse(500, { error: "Stripe checkout error." }, effectiveOrigin);
        }

        const paymentIntentId = typeof data.payment_intent === "string"
          ? data.payment_intent
          : data.payment_intent && typeof data.payment_intent === "object"
            ? data.payment_intent.id
            : null;
        const verified = data.status === "complete" && data.payment_status === "paid";

        return jsonResponse(200, {
          amountTotal: Number.isFinite(data.amount_total) ? data.amount_total : 0,
          currency: typeof data.currency === "string" ? data.currency : "usd",
          customerEmail: data.customer_details?.email || data.customer_email || null,
          paymentIntentId,
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
}

export { AnalyticsStore };
