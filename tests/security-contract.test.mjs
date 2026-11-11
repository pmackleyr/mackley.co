import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("operator UI never persists the temporary shared password", async () => {
  const [html, script] = await Promise.all([
    read("dashboard/index.html"),
    read("dashboard/dashboard.js")
  ]);
  assert.doesNotMatch(script, /PASSWORD_STORAGE_KEY|sessionStorage.*password/i);
  assert.match(html, /id="operator-login"/);
  assert.match(script, /credentials: "include"/);
});

test("the intake does not persist the medical questionnaire in local storage", async () => {
  const script = await read("spray-intake.js");
  assert.doesNotMatch(script, /localStorage\.setItem\(intakeStorageKey/);
  assert.match(script, /buildIntakeReceipt/);
  assert.match(script, /sessionStorage\.setItem\(intakeStorageKey/);
});

test("server code contains no fallback dashboard password", async () => {
  const [worker, legacyAuth] = await Promise.all([
    read("worker/src/index.js"),
    read("lib/data-auth.js")
  ]);
  assert.doesNotMatch(worker, /BreatheDeeper/);
  assert.doesNotMatch(legacyAuth, /BreatheDeeper/);
  assert.match(worker, /authorizeOperator/);
});

test("storefront checkout is separate from the legacy prescription workflow", async () => {
  const [home, netiPot, formula, intake, checkout, worker] = await Promise.all([
    read("index.html"),
    read("breathedeeper/index.html"),
    read("icanchange/index.html"),
    read("intake/index.html"),
    read("checkout/index.html"),
    read("worker/src/index.js")
  ]);

  const retailPaymentLink = "https://buy.stripe.com/7sY00j0Mx6EGdd256idwc05";
  for (const page of [home, netiPot, checkout]) {
    assert.ok(page.includes(retailPaymentLink));
    assert.doesNotMatch(page, /Get Prescription|data-neti-lead-form|next=payment/);
  }
  for (const page of [formula, intake]) {
    assert.match(page, /http-equiv="refresh" content="0; url=\/breathedeeper\/"/);
    assert.doesNotMatch(page, /spray-intake-form|stripe\.com/);
  }
  assert.ok(!worker.includes(retailPaymentLink));
});
