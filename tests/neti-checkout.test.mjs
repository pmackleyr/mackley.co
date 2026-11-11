import assert from "node:assert/strict";
import test from "node:test";
import worker from "../worker/src/index.js";

const webhookSecret = "test_netipot_webhook_secret";

async function signature(body) {
  const timestamp = Math.floor(Date.now() / 1000);
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(webhookSecret), {
    name: "HMAC",
    hash: "SHA-256"
  }, false, ["sign"]);
  const digest = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${timestamp}.${body}`));
  const hex = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `t=${timestamp},v1=${hex}`;
}

test("retired prescription and free-offer endpoints reject new submissions", async () => {
  for (const route of ["/provider-requests", "/create-checkout-session", "/neti-pot/leads"]) {
    const response = await worker.fetch(new Request(`https://api.mackley.co${route}`, {
      method: "POST",
      headers: { Origin: "https://mackley.co", "Content-Type": "application/json" },
      body: "{}"
    }), {});
    assert.equal(response.status, 410);
  }
});

test("signed retail checkout events bypass prescription authorization", async () => {
  const body = JSON.stringify({
    type: "checkout.session.completed",
    data: { object: { id: "cs_retail_test", payment_link: "plink_1UaTOnH2VzsYlSl5ySwWRGBS" } }
  });
  const response = await worker.fetch(new Request("https://api.mackley.co/stripe/webhook", {
    method: "POST",
    headers: { "Stripe-Signature": await signature(body) },
    body
  }), { STRIPE_WEBHOOK_SECRET: webhookSecret });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { received: true });
});

test("retail checkout events still require a valid Stripe signature", async () => {
  const response = await worker.fetch(new Request("https://api.mackley.co/stripe/webhook", {
    method: "POST",
    headers: { "Stripe-Signature": "t=1,v1=invalid" },
    body: JSON.stringify({ type: "checkout.session.completed" })
  }), { STRIPE_WEBHOOK_SECRET: webhookSecret });
  assert.equal(response.status, 400);
});
