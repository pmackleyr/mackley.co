const ALLOWED_HOSTS = new Set([
  "mackley.co",
  "mackley.co:443",
  "www.mackley.co",
  "www.mackley.co:443",
  "localhost:3000",
  "localhost:5173",
  "127.0.0.1:5500"
]);

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

function validateBody(body) {
  if (!body || typeof body !== "object") {
    return "Invalid payload.";
  }

  const allowIncomplete = Boolean(body.allowIncomplete);
  const quantity = Number(body.quantity);
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 10) {
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

    if (url.pathname !== "/create-payment-intent") {
      return jsonResponse(404, { error: "Not found." }, effectiveOrigin);
    }

    let payload = null;
    try {
      payload = await request.json();
    } catch (error) {
      return jsonResponse(400, { error: "Invalid JSON." }, effectiveOrigin);
    }

    const validationError = validateBody(payload);
    if (validationError) {
      return jsonResponse(400, { error: validationError }, effectiveOrigin);
    }

    const quantity = Number(payload.quantity);
    const discount = Math.max(0, (quantity - 1) * 500);
    const amount = Math.max(0, quantity * 5000 - discount);
    const params = new URLSearchParams();
    params.set("amount", String(amount));
    params.set("currency", "usd");
    params.set("automatic_payment_methods[enabled]", "true");
    if (isValidEmail(payload.email)) {
      params.set("receipt_email", payload.email);
    }
    params.set("metadata[product]", "Original Copper Neti Pot™");
    params.set("metadata[sku]", "DB-01");
    params.set("metadata[quantity]", String(payload.quantity));
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
        return jsonResponse(500, { error: "Stripe error." }, effectiveOrigin);
      }

      return jsonResponse(200, { clientSecret: data.client_secret }, effectiveOrigin);
    } catch (error) {
      return jsonResponse(500, { error: "Stripe error." }, effectiveOrigin);
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
