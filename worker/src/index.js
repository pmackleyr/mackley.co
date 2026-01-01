const ALLOWED_ORIGINS = new Set([
  "https://mackley.co",
  "https://www.mackley.co",
  "http://localhost:3000",
  "http://localhost:5173",
  "http://127.0.0.1:5500"
]);

function isAllowedOrigin(origin) {
  return Boolean(origin && ALLOWED_ORIGINS.has(origin));
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
  }
  return new Response(JSON.stringify(data), { status, headers });
}

function withCorsHeaders(headers, origin) {
  if (!origin) return headers;
  headers.set("Access-Control-Allow-Origin", origin);
  headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Content-Type");
  headers.set("Vary", "Origin");
  return headers;
}

function isValidEmail(email) {
  return typeof email === "string" && email.includes("@") && email.trim().length > 3;
}

function isNonEmpty(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function validateBody(body) {
  if (!body || typeof body !== "object") {
    return "Invalid payload.";
  }

  const quantity = Number(body.quantity);
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 10) {
    return "Quantity must be between 1 and 10.";
  }

  if (!isValidEmail(body.email)) {
    return "Email is required.";
  }

  if (!isNonEmpty(body.name)) {
    return "Name is required.";
  }

  if (body.shipping) {
    const shipping = body.shipping;
    if (!isNonEmpty(shipping.line1) || !isNonEmpty(shipping.city) || !isNonEmpty(shipping.state) || !isNonEmpty(shipping.postal) || !isNonEmpty(shipping.country)) {
      return "Shipping address is incomplete.";
    }
  }

  return null;
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

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin");

    const url = new URL(request.url);
    if (url.pathname === "/social-proof") {
      const corsOrigin = corsOriginForSocialProof(origin);
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

    if (!isAllowedOrigin(origin)) {
      return jsonResponse(403, { error: "Origin not allowed." }, origin);
    }

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: withCorsHeaders(new Headers(), origin)
      });
    }

    if (request.method !== "POST") {
      return jsonResponse(405, { error: "Method not allowed." }, origin);
    }

    if (url.pathname !== "/create-payment-intent") {
      return jsonResponse(404, { error: "Not found." }, origin);
    }

    let payload = null;
    try {
      payload = await request.json();
    } catch (error) {
      return jsonResponse(400, { error: "Invalid JSON." }, origin);
    }

    const validationError = validateBody(payload);
    if (validationError) {
      return jsonResponse(400, { error: validationError }, origin);
    }

    const quantity = Number(payload.quantity);
    const discount = Math.max(0, (quantity - 1) * 500);
    const amount = Math.max(0, quantity * 5000 - discount);
    const params = new URLSearchParams();
    params.set("amount", String(amount));
    params.set("currency", "usd");
    params.set("automatic_payment_methods[enabled]", "true");
    params.set("receipt_email", payload.email);
    params.set("metadata[product]", "Original Neti Pot");
    params.set("metadata[sku]", "DB-01");
    params.set("metadata[quantity]", String(payload.quantity));
    params.set("metadata[email]", payload.email);
    params.set("metadata[name]", payload.name);

    if (payload.shipping) {
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

    try {
      const response = await fetch("https://api.stripe.com/v1/payment_intents", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
          "Content-Type": "application/x-www-form-urlencoded"
        },
        body: params.toString()
      });

      const data = await response.json();
      if (!response.ok || !data.client_secret) {
        return jsonResponse(500, { error: "Stripe error." }, origin);
      }

      return jsonResponse(200, { clientSecret: data.client_secret }, origin);
    } catch (error) {
      return jsonResponse(500, { error: "Stripe error." }, origin);
    }
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
