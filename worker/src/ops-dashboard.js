import { ORDER_STATUS } from "./domain/order-state.js";

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function maskEmail(value) {
  const email = String(value || "").trim().toLowerCase();
  const [name, domain] = email.split("@");
  if (!name || !domain) return "";
  return `${name.slice(0, 2)}${"*".repeat(Math.max(2, Math.min(name.length - 2, 6)))}@${domain}`;
}

function initials(value) {
  return String(value || "")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.slice(0, 1).toUpperCase())
    .join("") || "--";
}

function hoursUntil(value) {
  const timestamp = Date.parse(value || "");
  if (!Number.isFinite(timestamp)) return null;
  return Number(((timestamp - Date.now()) / 3_600_000).toFixed(1));
}

function isReviewStatus(status) {
  return [
    ORDER_STATUS.AWAITING_AUTHORIZATION,
    ORDER_STATUS.PENDING,
    ORDER_STATUS.PROCESSING
  ].includes(status);
}

function safetySignalCount(request) {
  const values = Array.isArray(request?.safetyDiagnoses) ? request.safetyDiagnoses : [];
  return values.filter((value) => String(value || "").toLowerCase() !== "none").length;
}

function summarizeOrders(entries, options = {}) {
  return entries.map((entry) => {
    const order = entry.order || {};
    const request = entry.request || {};
    const expiryHours = hoursUntil(order.authorizationExpiresAt);
    const includedNetiPot = (Array.isArray(order.includedItems) ? order.includedItems : [])
      .filter((item) => item?.sku === "NETI-ORIGINAL")
      .reduce((total, item) => total + number(item.quantity), 0);
    return {
      orderId: order.orderId || "",
      requestId: order.requestId || "",
      person: options.canViewIdentity ? String(request.fullName || "").trim() : initials(request.fullName),
      email: options.canViewIdentity
        ? String(order.customerEmail || request.email || "").trim().toLowerCase()
        : maskEmail(order.customerEmail || request.email),
      contact: options.canViewIdentity
        ? String(order.customerEmail || request.email || "").trim().toLowerCase()
        : maskEmail(order.customerEmail || request.email),
      state: String(request.state || "").slice(0, 2).toUpperCase(),
      location: String(request.state || "").slice(0, 2).toUpperCase(),
      status: order.status || "UNKNOWN",
      submittedAt: request.submittedAt || order.createdAt || null,
      updatedAt: order.updatedAt || null,
      authorizationExpiresAt: order.authorizationExpiresAt || null,
      authorizationHoursRemaining: expiryHours,
      amountAuthorized: number(order.amountAuthorized),
      safetySignals: safetySignalCount(request),
      medicationDeclared: request.prescriptionMedications === "Yes",
      referralCode: order.referralCode || "",
      offerCode: order.offerCode || "",
      includedNetiPot,
      includedNetiPotStatus: (Array.isArray(order.includedItems) ? order.includedItems : [])
        .find((item) => item?.sku === "NETI-ORIGINAL")?.status || "",
      audit: Array.isArray(entry.audit) ? entry.audit.slice(0, 8) : []
    };
  });
}

function buildReliability(orders) {
  const processingStale = orders.filter((order) => {
    if (order.status !== ORDER_STATUS.PROCESSING) return false;
    return Date.now() - Date.parse(order.updatedAt || 0) > 15 * 60 * 1000;
  }).length;
  const expiringSoon = orders.filter((order) => (
    isReviewStatus(order.status)
    && order.authorizationHoursRemaining !== null
    && order.authorizationHoursRemaining <= 24
  )).length;
  const missingExpiry = orders.filter((order) => (
    order.status === ORDER_STATUS.PENDING && order.authorizationHoursRemaining === null
  )).length;
  const issues = [
    processingStale ? `${processingStale} approval job${processingStale === 1 ? "" : "s"} need attention` : "Approval processing is clear",
    expiringSoon ? `${expiringSoon} card authorization${expiringSoon === 1 ? "" : "s"} expire within 24 hours` : "No authorizations expire within 24 hours",
    missingExpiry ? `${missingExpiry} pending order${missingExpiry === 1 ? " is" : "s are"} missing an authorization expiry` : "Authorization expiry data is complete"
  ];
  return {
    status: processingStale || expiringSoon || missingExpiry ? "attention" : "healthy",
    processingStale,
    expiringSoon,
    missingExpiry,
    checks: issues
  };
}

function buildReferralSummary(orders) {
  const referred = orders.filter((order) => order.referralCode);
  const active = referred.filter((order) => order.status === ORDER_STATUS.ACTIVE);
  return {
    claims: referred.length,
    activated: active.length,
    conversionRate: referred.length ? Number(((active.length / referred.length) * 100).toFixed(1)) : 0,
    recent: referred.slice(0, 12).map((order) => ({
      orderId: order.orderId,
      code: order.referralCode,
      status: order.status,
      submittedAt: order.submittedAt
    }))
  };
}

function recentActivity(orders) {
  return orders
    .flatMap((order) => order.audit.map((event) => ({
      ...event,
      orderId: order.orderId,
      person: order.person
    })))
    .sort((left, right) => Date.parse(right.at || 0) - Date.parse(left.at || 0))
    .slice(0, 30);
}

export function buildOpsDashboard({ analytics, orderEntries, identity, days }) {
  const canViewIdentity = ["owner", "provider"].includes(identity.role);
  const canViewClinicalSignals = ["owner", "provider"].includes(identity.role);
  const orders = summarizeOrders(Array.isArray(orderEntries) ? orderEntries : [], { canViewIdentity }).map((order) => ({
    ...order,
    safetySignals: canViewClinicalSignals ? order.safetySignals : null,
    medicationDeclared: canViewClinicalSignals ? order.medicationDeclared : null
  }));
  const reviews = orders
    .filter((order) => isReviewStatus(order.status))
    .sort((left, right) => {
      const a = left.authorizationHoursRemaining ?? Number.POSITIVE_INFINITY;
      const b = right.authorizationHoursRemaining ?? Number.POSITIVE_INFINITY;
      return a - b;
    });
  const activeOrders = orders.filter((order) => order.status === ORDER_STATUS.ACTIVE);
  const deniedOrders = orders.filter((order) => order.status === ORDER_STATUS.DENIED);
  const authorizedValue = reviews.reduce((sum, order) => sum + order.amountAuthorized, 0);
  const capturedValue = activeOrders.reduce((sum, order) => sum + order.amountAuthorized, 0);
  const netiPotsIncluded = activeOrders.reduce((sum, order) => sum + order.includedNetiPot, 0);
  const metrics = analytics?.metrics || {};
  const purchases = number(metrics.purchaseSessions) || activeOrders.length;
  const sessions = number(metrics.landingSessions) || number(metrics.sessions);
  const clicks = number(metrics.beginCheckoutSessions);
  const surveySubmissions = number(metrics.providerSurveySessions);
  const funnel = [
    { label: "Landing sessions", value: sessions, rate: 100 },
    { label: "Get Prescription clicks", value: clicks, rate: number(metrics.checkoutRate) },
    { label: "Survey submissions", value: surveySubmissions, rate: number(metrics.providerSurveyRate) },
    { label: "Purchases", value: purchases, rate: number(metrics.purchaseRate) }
  ];

  return {
    generatedAt: new Date().toISOString(),
    days,
    viewer: { email: identity.email, role: identity.role },
    kpis: {
      sessions,
      surveySubmissions,
      pendingReviews: reviews.length,
      activeSubscriptions: activeOrders.length,
      purchases,
      purchaseValue: capturedValue,
      netiPotsIncluded,
      deniedRequests: deniedOrders.length,
      authorizedValue,
      surveyRate: number(metrics.providerSurveyRate),
      activationRate: orders.length ? Number(((activeOrders.length / orders.length) * 100).toFixed(1)) : 0
    },
    funnel,
    timeline: Array.isArray(analytics?.timeline) ? analytics.timeline : [],
    sources: Array.isArray(analytics?.sources) ? analytics.sources : [],
    reviews,
    people: orders.slice(0, 100),
    referrals: buildReferralSummary(orders),
    reliability: buildReliability(orders),
    activity: recentActivity(orders)
  };
}
