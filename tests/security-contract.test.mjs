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

test("public pages retain their primary product and intake contracts", async () => {
  const [home, productRedirect, formula, netiPot, intake] = await Promise.all([
    read("index.html"),
    read("product/index.html"),
    read("icanchange/index.html"),
    read("breathedeeper/index.html"),
    read("intake/index.html")
  ]);
  assert.match(home, /Intranasal Neuropeptide Formula/);
  assert.match(home, /But first:/);
  assert.match(productRedirect, /\/icanchange\//);
  assert.match(formula, /product-render\.js/);
  assert.match(netiPot, /Original Copper Neti Pot/);
  assert.match(netiPot, /BREATHEDEEPER/);
  assert.match(netiPot, /data-product-key="netiPot"/);
  assert.match(intake, /spray-intake-form/);
  assert.match(intake, /data-step="payment"/);
  assert.match(intake, /BREATHEDEEPER/);
  assert.match(intake, /shipping &amp; handling/);
});

test("the Neti Pot offer is code-gated and fails closed without a shipping rate", async () => {
  const [intakeScript, worker] = await Promise.all([
    read("spray-intake.js"),
    read("worker/src/index.js")
  ]);
  assert.match(intakeScript, /const netiOfferCode = "BREATHEDEEPER"/);
  assert.match(intakeScript, /offerType: "first_approved_shipment_neti_pot"/);
  assert.match(worker, /const INCLUDED_NETI_OFFER_CODE = "BREATHEDEEPER"/);
  assert.match(worker, /if \(!offerCode\) return false/);
  assert.match(worker, /NETI_SHIPPING_RATE_ID/);
  assert.match(worker, /shipping and handling is not configured/);
});
