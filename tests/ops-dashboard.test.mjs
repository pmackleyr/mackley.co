import assert from "node:assert/strict";
import test from "node:test";

import { buildOpsDashboard } from "../worker/src/ops-dashboard.js";

test("owner read model exposes contact data and prioritizes expiring reviews", () => {
  const result = buildOpsDashboard({
    analytics: {
      metrics: {
        sessions: 10,
        beginCheckoutSessions: 4,
        checkoutRate: 40,
        providerSurveySessions: 2,
        providerSurveyRate: 20,
        purchaseSessions: 1,
        purchaseRate: 10
      }
    },
    identity: { email: "owner@mackley.co", role: "owner" },
    days: 14,
    orderEntries: [{
      order: {
        orderId: "order_1",
        requestId: "request_1",
        status: "PENDING_PROVIDER_REVIEW",
        customerEmail: "person@example.com",
        amountAuthorized: 9900,
        authorizationExpiresAt: new Date(Date.now() + 6 * 3_600_000).toISOString()
      },
      request: {
        fullName: "Example Person",
        state: "CO",
        safetyDiagnoses: ["None"],
        prescriptionMedications: "No"
      },
      audit: []
    }, {
      order: {
        orderId: "order_2",
        requestId: "request_2",
        status: "ACTIVE",
        customerEmail: "active@example.com",
        amountAuthorized: 9900,
        includedItems: [{
          sku: "NETI-ORIGINAL",
          quantity: 1,
          status: "ready_for_first_shipment"
        }]
      },
      request: {
        fullName: "Active Person",
        state: "CA",
        safetyDiagnoses: ["None"],
        prescriptionMedications: "No"
      },
      audit: []
    }]
  });

  assert.equal(result.kpis.pendingReviews, 1);
  assert.equal(result.reviews[0].person, "Example Person");
  assert.equal(result.reviews[0].contact, "person@example.com");
  assert.equal(result.reviews[0].location, "CO");
  assert.equal(result.reliability.expiringSoon, 1);
  assert.equal(result.people[0].safetySignals, 0);
  assert.equal(result.kpis.purchases, 1);
  assert.equal(result.kpis.netiPotsIncluded, 1);
  assert.equal(result.people.find((person) => person.orderId === "order_2").includedNetiPot, 1);
  assert.deepEqual(result.funnel.map((stage) => stage.label), [
    "Landing sessions",
    "Get Prescription clicks",
    "Survey submissions",
    "Purchases"
  ]);
  assert.equal(result.funnel.some((stage) => /neti/i.test(stage.label)), false);
});

test("analyst read models omit clinical signal counts", () => {
  const result = buildOpsDashboard({
    analytics: { metrics: {}, funnel: [] },
    identity: { email: "analyst@mackley.co", role: "analyst" },
    days: 14,
    orderEntries: [{
      order: {
        orderId: "order_2",
        requestId: "request_2",
        status: "PENDING_PROVIDER_REVIEW",
        customerEmail: "person@example.com"
      },
      request: {
        fullName: "Example Person",
        safetyDiagnoses: ["Psychosis / schizophrenia"],
        prescriptionMedications: "Yes"
      },
      audit: []
    }]
  });

  assert.equal(result.people[0].safetySignals, null);
  assert.equal(result.people[0].medicationDeclared, null);
  assert.equal(result.people[0].person, "EP");
  assert.match(result.people[0].contact, /^pe\*+@example\.com$/);
});
