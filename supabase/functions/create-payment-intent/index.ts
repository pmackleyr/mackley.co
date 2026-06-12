import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const ALLOWED_HOSTS = new Set([
  "mackley.co",
  "mackley.co:443",
  "www.mackley.co",
  "www.mackley.co:443",
  "localhost:3000",
  "localhost:5173",
  "127.0.0.1:5500"
]);

function originFromHeader(value: string | null) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return `${url.protocol}//${url.host}`;
  } catch {
    return null;
  }
}

function isAllowedOrigin(origin: string | null) {
  const normalized = originFromHeader(origin);
  if (!normalized) return false;
  const host = new URL(normalized).host;
  return ALLOWED_HOSTS.has(host);
}

function inferOriginFromReferer(referer: string | null) {
  return originFromHeader(referer);
}

function jsonResponse(status: number, data: Record<string, unknown>, origin: string | null) {
  const headers = new Headers({
    "Content-Type": "application/json"
  });
  if (origin) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Vary", "Origin");
  }
  return new Response(JSON.stringify(data), { status, headers });
}

function withCorsHeaders(headers: Headers, origin: string | null) {
  if (!origin) return headers;
  headers.set("Access-Control-Allow-Origin", origin);
  headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Content-Type");
  headers.set("Vary", "Origin");
  return headers;
}

function isValidEmail(email: unknown) {
  return typeof email === "string" && email.includes("@") && email.trim().length > 3;
}

function isNonEmpty(value: unknown) {
  return typeof value === "string" && value.trim().length > 0;
}

function hasAnyShippingField(shipping: Record<string, unknown> | null) {
  if (!shipping || typeof shipping !== "object") return false;
  return ["line1", "line2", "city", "state", "postal", "country"].some((key) => isNonEmpty(shipping[key]));
}

function isCompleteShipping(shipping: Record<string, unknown> | null) {
  if (!shipping || typeof shipping !== "object") return false;
  return isNonEmpty(shipping.line1)
    && isNonEmpty(shipping.city)
    && isNonEmpty(shipping.state)
    && isNonEmpty(shipping.postal)
    && isNonEmpty(shipping.country);
}

function validateBody(body: Record<string, unknown> | null) {
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

  const shipping = body.shipping as Record<string, unknown> | null;
  if (shipping && hasAnyShippingField(shipping)) {
    if (!isCompleteShipping(shipping)) {
      return "Shipping address is incomplete.";
    }
  }

  return null;
}

serve(async (request) => {
  const origin = request.headers.get("Origin");
  const referer = request.headers.get("Referer");
  const inferredOrigin = origin ? null : inferOriginFromReferer(referer);
  const effectiveOrigin = isAllowedOrigin(origin)
    ? originFromHeader(origin)
    : inferredOrigin && isAllowedOrigin(inferredOrigin)
      ? inferredOrigin
      : originFromHeader(origin) || inferredOrigin || "*";

  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: withCorsHeaders(new Headers(), effectiveOrigin === "*" ? null : effectiveOrigin)
    });
  }

  if (request.method !== "POST") {
    return jsonResponse(405, { error: "Method not allowed." }, effectiveOrigin === "*" ? null : effectiveOrigin);
  }

  let payload: Record<string, unknown> | null = null;
  try {
    payload = await request.json();
  } catch {
    return jsonResponse(400, { error: "Invalid JSON." }, effectiveOrigin === "*" ? null : effectiveOrigin);
  }

  const validationError = validateBody(payload);
  if (validationError) {
    return jsonResponse(400, { error: validationError }, effectiveOrigin === "*" ? null : effectiveOrigin);
  }

  const quantity = Number(payload.quantity);
  const discount = Math.max(0, (quantity - 1) * 500);
  const amount = Math.max(0, quantity * 3000 - discount);
  const params = new URLSearchParams();
  params.set("amount", String(amount));
  params.set("currency", "usd");
  params.set("automatic_payment_methods[enabled]", "true");
  if (isValidEmail(payload.email)) {
    params.set("receipt_email", String(payload.email));
  }
  params.set("metadata[product]", "Intranasal Neuropeptide Formula");
  params.set("metadata[product_id]", "prod_UgF2SFTaA6cCVy");
  params.set("metadata[sku]", "INF-01");
  params.set("metadata[quantity]", String(payload.quantity));
  if (isNonEmpty(payload.email)) {
    params.set("metadata[email]", String(payload.email));
  }
  if (isNonEmpty(payload.name)) {
    params.set("metadata[name]", String(payload.name));
  }

  const shipping = payload.shipping as Record<string, unknown> | null;
  if (isCompleteShipping(shipping)) {
    params.set("shipping[name]", String(payload.name || ""));
    params.set("shipping[address][line1]", String(shipping?.line1 || ""));
    if (shipping?.line2) {
      params.set("shipping[address][line2]", String(shipping.line2));
    }
    params.set("shipping[address][city]", String(shipping?.city || ""));
    params.set("shipping[address][state]", String(shipping?.state || ""));
    params.set("shipping[address][postal_code]", String(shipping?.postal || ""));
    params.set("shipping[address][country]", String(shipping?.country || ""));
  }

  const secretKey = Deno.env.get("STRIPE_SECRET_KEY");
  if (!secretKey) {
    return jsonResponse(500, { error: "Stripe error." }, effectiveOrigin === "*" ? null : effectiveOrigin);
  }

  try {
    const response = await fetch("https://api.stripe.com/v1/payment_intents", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secretKey}`,
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: params.toString()
    });

    const data = await response.json();
    if (!response.ok || !data.client_secret) {
      return jsonResponse(500, { error: "Stripe error." }, effectiveOrigin === "*" ? null : effectiveOrigin);
    }

    return jsonResponse(200, { clientSecret: data.client_secret }, effectiveOrigin === "*" ? null : effectiveOrigin);
  } catch {
    return jsonResponse(500, { error: "Stripe error." }, effectiveOrigin === "*" ? null : effectiveOrigin);
  }
});
