(() => {
  const now = Date.now();
  const hoursFromNow = (hours) => new Date(now + hours * 3_600_000).toISOString();
  const daysAgo = (days) => new Date(now - days * 86_400_000).toISOString();

  const orders = [
    ["MK-1842", "Avery Reed", "avery@example.test", "CO", "PENDING_PROVIDER_REVIEW", 18, 1, true, "REF8Q2", "BREATHEDEEPER"],
    ["MK-1841", "Jordan Miller", "jordan@example.test", "CA", "PENDING_PROVIDER_REVIEW", 31, 0, false, "", ""],
    ["MK-1839", "Sam Lee", "sam@example.test", "NY", "APPROVAL_PROCESSING", 42, 2, true, "INF4D7", ""],
    ["MK-1837", "Devon King", "devon@example.test", "TX", "ACTIVE", 96, 0, false, "", ""],
    ["MK-1835", "Morgan Cole", "morgan@example.test", "WA", "ACTIVE", 112, 1, false, "REF6P1", "BREATHEDEEPER"],
    ["MK-1833", "Taylor Nash", "taylor@example.test", "FL", "DENIED", 0, 3, true, "", "BREATHEDEEPER"],
    ["MK-1831", "Riley Brooks", "riley@example.test", "UT", "ACTIVE", 144, 0, false, "", ""],
    ["MK-1828", "Kai Lane", "kai@example.test", "OR", "ACTIVE", 156, 0, true, "REF2A9", "BREATHEDEEPER"],
    ["MK-1825", "Casey Park", "casey@example.test", "IL", "DENIED", 0, 2, true, "", ""],
    ["MK-1821", "Noah Wells", "noah@example.test", "MA", "ACTIVE", 170, 0, false, "", ""],
    ["MK-1817", "Blair Hall", "blair@example.test", "AZ", "ACTIVE", 190, 0, false, "REF7K3", ""],
    ["MK-1812", "Elliot Stone", "elliot@example.test", "CO", "ACTIVE", 210, 0, false, "", ""]
  ].map((row, index) => ({
    orderId: row[0],
    requestId: `REQ-${row[0].slice(3)}`,
    person: row[1],
    email: row[2],
    contact: row[2],
    state: row[3],
    location: row[3],
    status: row[4],
    submittedAt: daysAgo((index + 1) / 2),
    updatedAt: daysAgo(index / 3),
    authorizationExpiresAt: row[4] === "DENIED" ? null : hoursFromNow(row[5]),
    authorizationHoursRemaining: row[4] === "DENIED" ? null : row[5],
    amountAuthorized: 9900,
    safetySignals: row[6],
    medicationDeclared: row[7],
    referralCode: row[8],
    offerCode: row[9],
    includedNetiPot: row[4] === "ACTIVE" && row[9] === "BREATHEDEEPER" ? 1 : 0,
    includedNetiPotStatus: row[9] === "BREATHEDEEPER"
      ? (row[4] === "ACTIVE" ? "ready_for_first_shipment" : "pending_provider_approval")
      : "",
    audit: [{
      id: `audit-${index}`,
      at: daysAgo(index / 3),
      action: row[4] === "ACTIVE" ? "status_changed" : "order_created",
      fromStatus: row[4] === "ACTIVE" ? "PAYMENT_CAPTURED" : null,
      toStatus: row[4],
      reason: row[4] === "ACTIVE" ? "subscription_activated" : "checkout_completed",
      actor: { id: "system", email: "", role: "system" }
    }]
  }));

  const reviews = orders.filter((order) => [
    "AWAITING_AUTHORIZATION",
    "PENDING_PROVIDER_REVIEW",
    "APPROVAL_PROCESSING"
  ].includes(order.status));

  window.MACKLEY_OPS_DEMO = {
    generatedAt: new Date().toISOString(),
    days: 14,
    viewer: { email: "preview@mackley.co", role: "owner" },
    kpis: {
      sessions: 1284,
      surveySubmissions: 86,
      pendingReviews: reviews.length,
      activeSubscriptions: 7,
      purchases: 61,
      purchaseValue: 603900,
      netiPotsIncluded: orders.reduce((sum, order) => sum + order.includedNetiPot, 0),
      deniedRequests: 2,
      authorizedValue: reviews.reduce((sum, order) => sum + order.amountAuthorized, 0),
      surveyRate: 8.4,
      activationRate: 58.3
    },
    funnel: [
      { label: "Landing sessions", value: 1284, rate: 100 },
      { label: "Get Prescription clicks", value: 214, rate: 16.7 },
      { label: "Survey submissions", value: 86, rate: 6.7 },
      { label: "Purchases", value: 61, rate: 4.8 }
    ],
    timeline: [],
    sources: [
      { label: "Direct", sessions: 512, providerSurveyRate: 9.8 },
      { label: "Instagram", sessions: 331, providerSurveyRate: 7.6 },
      { label: "Referral", sessions: 224, providerSurveyRate: 13.4 },
      { label: "Google", sessions: 147, providerSurveyRate: 5.2 },
      { label: "Other", sessions: 70, providerSurveyRate: 4.3 }
    ],
    reviews,
    people: orders,
    referrals: {
      claims: 18,
      activated: 11,
      conversionRate: 61.1,
      recent: orders.filter((order) => order.referralCode).map((order) => ({
        orderId: order.orderId,
        code: order.referralCode,
        status: order.status,
        submittedAt: order.submittedAt
      }))
    },
    reliability: {
      status: "attention",
      processingStale: 0,
      expiringSoon: 1,
      missingExpiry: 0,
      checks: [
        "Approval processing is clear",
        "1 card authorization expires within 24 hours",
        "Authorization expiry data is complete",
        "Stripe webhook delivery is current",
        "Provider email delivery is current"
      ]
    },
    activity: orders
      .flatMap((order) => order.audit.map((event) => ({ ...event, orderId: order.orderId, person: order.person })))
      .slice(0, 10)
  };
})();
