const RETENTION_DAYS = 90;
const RECENT_SESSION_LIMIT = 40;
const MAX_TIMELINE_EVENTS = 24;
const MAX_UNIQUE_ITEMS = 8;
const MAX_ACCESS_ENTRIES = 250;
const VALID_DAY_WINDOWS = [7, 14, 30, 60, RETENTION_DAYS];
const LANDING_VARIANT_LABELS = {
  a: "A current flow",
  b: "B white product hero",
  unknown: "Unknown variant"
};

function jsonResponse(status, data) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json"
    }
  });
}

function normalizeString(value, max = 160) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

function normalizeLandingVariant(value) {
  const next = normalizeString(value, 24).toLowerCase();
  if (next === "a" || next === "b") return next;
  return "";
}

function normalizeNumber(value, fallback = 0) {
  const next = Number(value);
  return Number.isFinite(next) ? next : fallback;
}

function asTimestamp(value) {
  if (typeof value === "number") {
    return value > 1e12 ? value : value * 1000;
  }

  if (typeof value === "string" && value) {
    const asNumber = Number(value);
    if (Number.isFinite(asNumber)) {
      return asNumber > 1e12 ? asNumber : asNumber * 1000;
    }

    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) return parsed;
  }

  return Date.now();
}

function dayKey(timestamp) {
  return new Date(timestamp).toISOString().slice(0, 10);
}

function hashKey(value) {
  return encodeURIComponent(value);
}

function normalizeDeviceType(value) {
  const next = normalizeString(value, 24).toLowerCase();
  if (["mobile", "tablet", "desktop"].includes(next)) {
    return next;
  }
  return "unknown";
}

function capitalize(value) {
  const text = normalizeString(value, 80);
  if (!text) return "";
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function inferBrowser(userAgent) {
  const ua = String(userAgent || "");
  if (/edg\//i.test(ua)) return "Edge";
  if (/chrome\//i.test(ua) && !/edg\//i.test(ua)) return "Chrome";
  if (/safari\//i.test(ua) && !/chrome\//i.test(ua)) return "Safari";
  if (/firefox\//i.test(ua)) return "Firefox";
  if (/msie|trident/i.test(ua)) return "Internet Explorer";
  return "";
}

function inferOs(userAgent) {
  const ua = String(userAgent || "");
  if (/windows nt/i.test(ua)) return "Windows";
  if (/android/i.test(ua)) return "Android";
  if (/iphone|ipad|ipod/i.test(ua)) return "iOS";
  if (/mac os x/i.test(ua)) return "macOS";
  if (/linux/i.test(ua)) return "Linux";
  return "";
}

function buildDeviceSummary(device) {
  const parts = [];
  const deviceType = capitalize(device?.deviceType || "");
  if (deviceType && deviceType !== "Unknown") {
    parts.push(deviceType);
  }
  if (device?.browser) parts.push(device.browser);
  if (device?.os) parts.push(device.os);
  return parts.length ? parts.join(" · ") : "Unknown device";
}

function normalizeLocationFromPayload(payload) {
  const city = normalizeString(payload.city || payload.geo_city || payload.$city || "", 80);
  const region = normalizeString(payload.region || payload.geo_region || payload.$region || "", 80);
  const country = normalizeString(payload.country || payload.geo_country || payload.$country_name || "", 80);
  const countryCode = normalizeString(payload.country_code || payload.geo_country_code || payload.$country_code || "", 8);
  const timezone = normalizeString(payload.timezone || payload.browser_timezone || payload.$timezone || "", 60);
  const ip = normalizeString(payload.ip || payload.request_ip || payload.client_ip || "", 80);

  let summary = "Unknown location";
  if (city && region) summary = `${city}, ${region}`;
  else if (city && country) summary = `${city}, ${country}`;
  else if (region && country) summary = `${region}, ${country}`;
  else if (country) summary = country;
  else if (countryCode) summary = countryCode;

  return {
    city,
    region,
    country,
    countryCode,
    timezone,
    ip,
    summary
  };
}

function normalizeDeviceFromPayload(payload) {
  const userAgent = normalizeString(payload.user_agent || payload.$user_agent || "", 240);
  const deviceType = normalizeDeviceType(payload.device_type || payload.$device_type);
  const browser = normalizeString(payload.browser || payload.$browser || inferBrowser(userAgent), 40);
  const os = normalizeString(payload.os || payload.$os || inferOs(userAgent), 40);
  const viewportWidth = normalizeNumber(payload.viewport_width);
  const viewportHeight = normalizeNumber(payload.viewport_height);
  const screenWidth = normalizeNumber(payload.screen_width || viewportWidth);
  const screenHeight = normalizeNumber(payload.screen_height || viewportHeight);
  const language = normalizeString(payload.language || payload.locale || payload.$language || "", 24);
  const timezone = normalizeString(payload.timezone || payload.browser_timezone || payload.$timezone || "", 60);
  const touchPoints = normalizeNumber(payload.touch_points);
  const devicePixelRatio = normalizeNumber(payload.device_pixel_ratio, 1);

  return {
    browser,
    os,
    deviceType,
    viewportWidth,
    viewportHeight,
    screenWidth,
    screenHeight,
    language,
    timezone,
    touchPoints,
    devicePixelRatio,
    userAgent,
    summary: buildDeviceSummary({ browser, os, deviceType })
  };
}

function sourceSummaryFromPayload(payload) {
  const source = normalizeString(payload.last_source || payload.first_source || "direct", 80) || "direct";
  const medium = normalizeString(payload.last_medium || payload.first_medium || "direct", 80) || "direct";
  const campaign = normalizeString(payload.last_campaign || payload.first_campaign || "", 120);

  return {
    source,
    medium,
    campaign,
    key: campaign ? `${source} / ${medium} / ${campaign}` : `${source} / ${medium}`
  };
}

function payloadHasAttribution(payload) {
  return Boolean(
    normalizeString(payload.last_source || payload.first_source || "", 80)
    || normalizeString(payload.last_medium || payload.first_medium || "", 80)
    || normalizeString(payload.last_campaign || payload.first_campaign || "", 120)
  );
}

function sessionStorageKey(sessionId) {
  return `session:${sessionId}`;
}

function dedupeStorageKey(eventId) {
  return `event:${eventId}`;
}

function dailyStorageKey(day) {
  return `daily:${day}`;
}

function sourceStorageKey(day, sourceKey) {
  return `source:${day}:${hashKey(sourceKey)}`;
}

function clickStorageKey(day, clickKey) {
  return `click:${day}:${hashKey(clickKey)}`;
}

function pageStorageKey(day, pageKey) {
  return `page:${day}:${hashKey(pageKey)}`;
}

function variantStorageKey(day, variant) {
  return `variant:${day}:${hashKey(variant || "unknown")}`;
}

function accessEntryKey(timestamp, eventId) {
  return `access:${timestamp}:${hashKey(eventId)}`;
}

function createEmptySession(sessionId, payload, timestamp) {
  const source = sourceSummaryFromPayload(payload);
  const initialPath = normalizeString(payload.page_path || payload.page_location || "/", 140) || "/";
  const device = normalizeDeviceFromPayload(payload);
  const location = normalizeLocationFromPayload(payload);

  return {
    sessionId,
    visitorId: normalizeString(payload.visitor_id || payload.distinct_id || sessionId, 120),
    visitorType: normalizeString(payload.visitor_type || "unknown", 30) || "unknown",
    deviceType: device.deviceType,
    language: normalizeString(payload.language || "", 24),
    device,
    location,
    startedAt: timestamp,
    lastEventAt: timestamp,
    firstPath: initialPath,
    lastPath: initialPath,
    source: source.source,
    medium: source.medium,
    campaign: source.campaign,
    sourceKey: source.key,
    experimentName: normalizeString(payload.experiment_name || "", 80),
    landingVariant: normalizeLandingVariant(payload.landing_variant),
    referrerDomain: normalizeString(payload.referrer_domain || "", 120),
    pageViews: 0,
    eventsCount: 0,
    ctaImpression: false,
    beginCheckout: false,
    providerSurveySubmitted: false,
    checkoutRedirect: false,
    purchaseVerified: false,
    checkoutBlocked: false,
    blockedReason: "",
    deepScroll: false,
    engaged30: false,
    maxScrollPercent: 0,
    engagedTimeSeconds: 0,
    carouselInteractions: 0,
    clickCount: 0,
    recentJourney: [],
    pagePaths: [],
    clickedTargets: [],
    eventTimeline: [],
    purchaseValue: 0,
    transactionId: "",
    checkoutStepMap: {}
  };
}

function cloneValue(value) {
  return JSON.parse(JSON.stringify(value));
}

function pushUniqueLimited(list, value, limit) {
  if (!value) return Array.isArray(list) ? list : [];
  const next = Array.isArray(list) ? [...list] : [];
  const existingIndex = next.indexOf(value);
  if (existingIndex >= 0) {
    next.splice(existingIndex, 1);
  }
  next.unshift(value);
  return next.slice(0, limit);
}

function appendJourney(list, item, limit) {
  const next = Array.isArray(list) ? [...list] : [];
  next.push(item);
  return next.slice(-limit);
}

function appendTimeline(list, entry, limit) {
  const next = Array.isArray(list) ? [...list] : [];
  next.push(entry);
  return next.slice(-limit);
}

function summarizeStatus(session) {
  if (session.purchaseVerified) return "purchased";
  if (session.checkoutBlocked) return "blocked";
  if (session.checkoutRedirect) return "redirected";
  if (session.beginCheckout) return "checkout";
  if (session.deepScroll || session.engaged30) return "engaged";
  return "bounce";
}

function createEmptyDaily(day) {
  return {
    day,
    sessions: 0,
    landingSessions: 0,
    newSessions: 0,
    returningSessions: 0,
    totalEvents: 0,
    pageViews: 0,
    ctaImpressionSessions: 0,
    beginCheckoutSessions: 0,
    providerSurveySessions: 0,
    checkoutRedirectSessions: 0,
    purchaseSessions: 0,
    blockedSessions: 0,
    deepScrollSessions: 0,
    engagedSessions: 0,
    carouselSessions: 0,
    totalEngagedSeconds: 0,
    exitCount: 0
  };
}

function createEmptySource(day, label, source, medium, campaign) {
  return {
    day,
    label,
    source,
    medium,
    campaign,
    sessions: 0,
    beginCheckout: 0,
    providerSurveySubmissions: 0,
    purchases: 0,
    blocked: 0
  };
}

function createEmptyClick(day, label, href, pagePath) {
  return {
    day,
    label,
    href,
    pagePath,
    clicks: 0
  };
}

function createEmptyPage(day, pagePath) {
  return {
    day,
    pagePath,
    pageViews: 0,
    beginCheckout: 0,
    providerSurveySubmissions: 0,
    purchases: 0
  };
}

function createEmptyVariant(day, variant) {
  return {
    day,
    variant: variant || "unknown",
    label: LANDING_VARIANT_LABELS[variant] || LANDING_VARIANT_LABELS.unknown,
    sessions: 0,
    pageViews: 0,
    ctaImpressionSessions: 0,
    beginCheckoutSessions: 0,
    providerSurveySubmissions: 0,
    purchaseSessions: 0,
    blockedSessions: 0,
    deepScrollSessions: 0,
    engagedSessions: 0,
    carouselSessions: 0
  };
}

async function loadOr(state, key, factory) {
  const stored = await state.storage.get(key);
  return stored || factory();
}

function formatPercent(numerator, denominator) {
  if (!denominator) return 0;
  return Number(((numerator / denominator) * 100).toFixed(1));
}

function formatPercentCapped(numerator, denominator) {
  if (!denominator) return 0;
  return formatPercent(Math.min(numerator, denominator), denominator);
}

function normalizeDays(value) {
  const next = Number(value);
  return VALID_DAY_WINDOWS.includes(next) ? next : 14;
}

function recentSessionKey(session) {
  return {
    sessionId: session.sessionId,
    lastEventAt: session.lastEventAt
  };
}

async function updateRecentSessions(state, session) {
  const stored = (await state.storage.get("recent_sessions")) || [];
  const withoutCurrent = stored.filter((entry) => entry.sessionId !== session.sessionId);
  withoutCurrent.unshift(recentSessionKey(session));
  await state.storage.put("recent_sessions", withoutCurrent.slice(0, RECENT_SESSION_LIMIT));
}

function eventTimelineEntry(event, timestamp, payload, path) {
  const entry = {
    at: timestamp,
    event,
    path
  };

  const label = normalizeString(payload.target_label || payload.step || payload.reason || "", 120);
  const href = normalizeString(payload.target_href || "", 240);
  const scrollPercent = normalizeNumber(payload.percent_scrolled || payload.max_scroll_percent);
  const seconds = normalizeNumber(payload.milestone_seconds || payload.engaged_time_seconds);

  if (label) entry.label = label;
  if (href) entry.href = href;
  if (scrollPercent) entry.scrollPercent = scrollPercent;
  if (seconds) entry.seconds = seconds;

  return entry;
}

function variantBottleneck(variant) {
  if (!variant.sessions) return "No traffic";
  if (variant.sessions < 20) return "Collecting sample";
  if (variant.ctaVisibilityRate < 70) return "CTA visibility";
  if (variant.clickRate < 10) return "Offer click intent";
  if (variant.beginCheckoutSessions >= 10 && variant.formCompletionRateFromClick < 45) return "Intake form completion";
  if (variant.beginCheckoutSessions >= 10 && variant.purchaseRateFromClick < 35) return "Intake/payment handoff";
  if (variant.blockedSessions > 0) return "Checkout reliability";
  return "Scale and keep testing";
}

function buildExperimentSummary(variantRows) {
  const grouped = variantRows.reduce((acc, row) => {
    const variant = normalizeLandingVariant(row.variant) || "unknown";
    if (!acc.has(variant)) {
      acc.set(variant, createEmptyVariant("all", variant));
    }
    const entry = acc.get(variant);
    entry.sessions += normalizeNumber(row.sessions);
    entry.pageViews += normalizeNumber(row.pageViews);
    entry.ctaImpressionSessions += normalizeNumber(row.ctaImpressionSessions);
    entry.beginCheckoutSessions += normalizeNumber(row.beginCheckoutSessions);
    entry.providerSurveySubmissions += normalizeNumber(row.providerSurveySubmissions);
    entry.purchaseSessions += normalizeNumber(row.purchaseSessions);
    entry.blockedSessions += normalizeNumber(row.blockedSessions);
    entry.deepScrollSessions += normalizeNumber(row.deepScrollSessions);
    entry.engagedSessions += normalizeNumber(row.engagedSessions);
    entry.carouselSessions += normalizeNumber(row.carouselSessions);
    return acc;
  }, new Map());

  ["a", "b"].forEach((variant) => {
    if (!grouped.has(variant)) {
      grouped.set(variant, createEmptyVariant("all", variant));
    }
  });

  const totalSessions = Array.from(grouped.values()).reduce((sum, row) => sum + row.sessions, 0);
  const variants = Array.from(grouped.values())
    .filter((row) => row.variant === "a" || row.variant === "b" || row.sessions > 0)
    .map((row) => {
      const variant = normalizeLandingVariant(row.variant) || "unknown";
      const summary = {
        variant,
        label: LANDING_VARIANT_LABELS[variant] || LANDING_VARIANT_LABELS.unknown,
        sessions: row.sessions,
        trafficShare: formatPercent(row.sessions, totalSessions),
        pageViews: row.pageViews,
        ctaImpressionSessions: row.ctaImpressionSessions,
        beginCheckoutSessions: row.beginCheckoutSessions,
        providerSurveySubmissions: row.providerSurveySubmissions,
        purchaseSessions: row.purchaseSessions,
        blockedSessions: row.blockedSessions,
        deepScrollSessions: row.deepScrollSessions,
        engagedSessions: row.engagedSessions,
        carouselSessions: row.carouselSessions,
        ctaVisibilityRate: formatPercentCapped(row.ctaImpressionSessions, row.sessions),
        clickRate: formatPercentCapped(row.beginCheckoutSessions, row.sessions),
        clickRateFromCta: formatPercentCapped(row.beginCheckoutSessions, row.ctaImpressionSessions),
        formSubmissionRate: formatPercentCapped(row.providerSurveySubmissions, row.sessions),
        formCompletionRateFromClick: formatPercentCapped(row.providerSurveySubmissions, row.beginCheckoutSessions),
        purchaseRate: formatPercentCapped(row.purchaseSessions, row.sessions),
        purchaseRateFromClick: formatPercentCapped(row.purchaseSessions, row.beginCheckoutSessions),
        blockedRate: formatPercentCapped(row.blockedSessions, row.sessions)
      };
      summary.bottleneck = variantBottleneck(summary);
      summary.status = summary.sessions < 20 ? "collecting" : "ready";
      return summary;
    })
    .sort((left, right) => {
      if (left.variant === "a") return -1;
      if (right.variant === "a") return 1;
      if (left.variant === "b") return -1;
      if (right.variant === "b") return 1;
      return right.sessions - left.sessions;
    });

  const comparable = variants.filter((variant) => variant.sessions >= 20);
  const leader = comparable.length
    ? [...comparable].sort((left, right) => right.clickRate - left.clickRate || right.beginCheckoutSessions - left.beginCheckoutSessions)[0]
    : null;

  variants.forEach((variant) => {
    if (!leader || variant.sessions < 20) return;
    variant.status = variant.variant === leader.variant ? "leading" : "lagging";
    variant.liftVsLeader = Number((variant.clickRate - leader.clickRate).toFixed(1));
  });

  const insight = leader
    ? `${leader.label} is leading on clicks/form starts at ${leader.clickRate}%.`
    : "Collect at least 20 sessions per variant before calling a winner.";

  return {
    name: "home_landing_hero",
    goal: "Clicks / form starts",
    totalSessions,
    leaderVariant: leader?.variant || "",
    insight,
    variants
  };
}

function buildRecommendations(metrics, sources, clicks, experiment) {
  const recommendations = [];

  if (metrics.blockedSessions > 0) {
    recommendations.push({
      priority: "critical",
      title: "Checkout is leaking revenue",
      detail: `${metrics.blockedSessions} session(s) hit a blocked checkout or redirect state in this range.`,
      action: "Fix the broken handoff to Stripe before increasing paid traffic."
    });
  }

  const leadingVariant = experiment?.variants?.find((variant) => variant.status === "leading");
  const laggingVariant = experiment?.variants?.find((variant) => variant.status === "lagging");
  if (leadingVariant && laggingVariant && leadingVariant.clickRate - laggingVariant.clickRate >= 2) {
    recommendations.push({
      priority: "high",
      title: `${leadingVariant.label} is the current click-rate leader`,
      detail: `${leadingVariant.label} starts ${leadingVariant.clickRate}% of sessions versus ${laggingVariant.clickRate}% for ${laggingVariant.label}.`,
      action: `Inspect the lagging bottleneck (${laggingVariant.bottleneck}) before shifting more traffic.`
    });
  }

  if (metrics.sessions >= 10 && metrics.ctaVisibilityRate < 70) {
    recommendations.push({
      priority: "high",
      title: "Too many visitors never reach the buy moment",
      detail: `Only ${metrics.ctaVisibilityRate}% of landing sessions see a strong CTA.`,
      action: "Move the buying action higher, shorten the first screen, or add a sticky mobile CTA."
    });
  }

  if (metrics.ctaImpressionSessions >= 20 && metrics.checkoutRateFromCta < 10) {
    recommendations.push({
      priority: "high",
      title: "The page is generating interest but not enough intent",
      detail: `Only ${metrics.checkoutRateFromCta}% of CTA viewers start checkout.`,
      action: "Test clearer promise, stronger trust proof, and tighter price framing."
    });
  }

  if (metrics.beginCheckoutSessions >= 10 && metrics.providerSurveyRateFromCheckout < 45) {
    recommendations.push({
      priority: "high",
      title: "Form starts are not becoming submissions",
      detail: `Only ${metrics.providerSurveyRateFromCheckout}% of Get Started clicks complete the provider survey.`,
      action: "Shorten the intake, clarify required fields, or save progress earlier in the flow."
    });
  }

  if (metrics.beginCheckoutSessions >= 10 && metrics.purchaseRateFromCheckout < 35) {
    recommendations.push({
      priority: "high",
      title: "Checkout starts are not turning into purchases fast enough",
      detail: `Only ${metrics.purchaseRateFromCheckout}% of checkout sessions reach verified purchase.`,
      action: "Audit Stripe redirect, payment confirmation, and the thank-you verification path."
    });
  }

  if (metrics.sessions >= 10 && metrics.deepScrollRate < 45) {
    recommendations.push({
      priority: "medium",
      title: "Visitors are not getting deep enough into the page",
      detail: `Only ${metrics.deepScrollRate}% of sessions pass the 50% scroll mark.`,
      action: "Tighten the intro, surface proof faster, and reduce narrative before the decision point."
    });
  }

  const weakSource = sources.find((source) => source.sessions >= 10 && source.checkoutRate < metrics.checkoutRate * 0.65);
  if (weakSource) {
    recommendations.push({
      priority: "medium",
      title: `${weakSource.label} traffic is underperforming`,
      detail: `${weakSource.label} sent ${weakSource.sessions} sessions but only ${weakSource.checkoutRate}% started checkout.`,
      action: "Match the ad promise and first-screen message more tightly."
    });
  }

  const topClick = clicks[0];
  if (topClick && /purpose|privacy|cookie/i.test(topClick.label)) {
    recommendations.push({
      priority: "medium",
      title: "Visitors appear to want reassurance before buying",
      detail: `"${topClick.label}" is one of the most clicked targets.`,
      action: "Move trust, shipping clarity, and material proof closer to the main CTA."
    });
  }

  if (!recommendations.length) {
    recommendations.push({
      priority: "watch",
      title: "No single leak dominates this sample",
      detail: "The page is likely constrained more by traffic quality or creative quality than by one broken step.",
      action: "Run one focused change at a time and watch checkout rate, not just clicks."
    });
  }

  return recommendations.slice(0, 4);
}

function buildDashboardFromData(days, dailyRows, sourceRows, clickRows, pageRows, variantRows, recentSessions) {
  const totals = dailyRows.reduce((acc, row) => {
    acc.sessions += row.sessions;
    acc.landingSessions += row.landingSessions;
    acc.newSessions += row.newSessions;
    acc.returningSessions += row.returningSessions;
    acc.totalEvents += row.totalEvents;
    acc.pageViews += row.pageViews;
    acc.ctaImpressionSessions += row.ctaImpressionSessions;
    acc.beginCheckoutSessions += row.beginCheckoutSessions;
    acc.providerSurveySessions += row.providerSurveySessions || 0;
    acc.checkoutRedirectSessions += row.checkoutRedirectSessions;
    acc.purchaseSessions += row.purchaseSessions;
    acc.blockedSessions += row.blockedSessions;
    acc.deepScrollSessions += row.deepScrollSessions;
    acc.engagedSessions += row.engagedSessions;
    acc.carouselSessions += row.carouselSessions;
    acc.totalEngagedSeconds += row.totalEngagedSeconds;
    acc.exitCount += row.exitCount;
    return acc;
  }, {
    sessions: 0,
    landingSessions: 0,
    newSessions: 0,
    returningSessions: 0,
    totalEvents: 0,
    pageViews: 0,
    ctaImpressionSessions: 0,
    beginCheckoutSessions: 0,
    providerSurveySessions: 0,
    checkoutRedirectSessions: 0,
    purchaseSessions: 0,
    blockedSessions: 0,
    deepScrollSessions: 0,
    engagedSessions: 0,
    carouselSessions: 0,
    totalEngagedSeconds: 0,
    exitCount: 0
  });

  const metrics = {
    days,
    sessions: totals.sessions,
    landingSessions: totals.landingSessions,
    newSessions: totals.newSessions,
    returningSessions: totals.returningSessions,
    returningRate: formatPercent(totals.returningSessions, totals.sessions),
    totalEvents: totals.totalEvents,
    pageViews: totals.pageViews,
    ctaImpressionSessions: totals.ctaImpressionSessions,
    beginCheckoutSessions: totals.beginCheckoutSessions,
    providerSurveySessions: totals.providerSurveySessions,
    checkoutRedirectSessions: totals.checkoutRedirectSessions,
    purchaseSessions: totals.purchaseSessions,
    blockedSessions: totals.blockedSessions,
    deepScrollSessions: totals.deepScrollSessions,
    engagedSessions: totals.engagedSessions,
    carouselSessions: totals.carouselSessions,
    ctaVisibilityRate: formatPercent(totals.ctaImpressionSessions, totals.landingSessions || totals.sessions),
    checkoutRate: formatPercent(totals.beginCheckoutSessions, totals.landingSessions || totals.sessions),
    checkoutRateFromCta: formatPercentCapped(totals.beginCheckoutSessions, totals.ctaImpressionSessions),
    providerSurveyRate: formatPercent(totals.providerSurveySessions, totals.landingSessions || totals.sessions),
    providerSurveyRateFromCheckout: formatPercentCapped(totals.providerSurveySessions, totals.beginCheckoutSessions),
    purchaseRate: formatPercent(totals.purchaseSessions, totals.landingSessions || totals.sessions),
    purchaseRateFromCheckout: formatPercentCapped(totals.purchaseSessions, totals.beginCheckoutSessions),
    deepScrollRate: formatPercent(totals.deepScrollSessions, totals.landingSessions || totals.sessions),
    engagementRate: formatPercent(totals.engagedSessions, totals.sessions),
    averageEngagedSeconds: totals.exitCount ? Number((totals.totalEngagedSeconds / totals.exitCount).toFixed(1)) : 0
  };

  const sources = sourceRows.reduce((acc, row) => {
    if (!acc.has(row.label)) {
      acc.set(row.label, {
        label: row.label,
        source: row.source,
        medium: row.medium,
        campaign: row.campaign,
        sessions: 0,
        beginCheckout: 0,
        providerSurveySubmissions: 0,
        purchases: 0,
        blocked: 0
      });
    }
    const entry = acc.get(row.label);
    entry.sessions += row.sessions;
    entry.beginCheckout += row.beginCheckout;
    entry.providerSurveySubmissions += row.providerSurveySubmissions || 0;
    entry.purchases += row.purchases;
    entry.blocked += row.blocked;
    return acc;
  }, new Map());

  const sourceList = Array.from(sources.values())
    .map((entry) => ({
      ...entry,
      checkoutRate: formatPercentCapped(entry.beginCheckout, entry.sessions),
      providerSurveyRate: formatPercentCapped(entry.providerSurveySubmissions, entry.sessions),
      purchaseRate: formatPercentCapped(entry.purchases, entry.sessions),
      blockedRate: formatPercentCapped(entry.blocked, entry.sessions)
    }))
    .sort((left, right) => right.sessions - left.sessions)
    .slice(0, 8);

  const clickTargets = clickRows.reduce((acc, row) => {
    const key = `${row.label}:::${row.href}`;
    if (!acc.has(key)) {
      acc.set(key, {
        label: row.label,
        href: row.href,
        clicks: 0,
        pagePath: row.pagePath
      });
    }
    const entry = acc.get(key);
    entry.clicks += row.clicks;
    return acc;
  }, new Map());

  const topClicks = Array.from(clickTargets.values())
    .sort((left, right) => right.clicks - left.clicks)
    .slice(0, 10);

  const pages = pageRows.reduce((acc, row) => {
    if (!acc.has(row.pagePath)) {
      acc.set(row.pagePath, {
        pagePath: row.pagePath,
        pageViews: 0,
        beginCheckout: 0,
        providerSurveySubmissions: 0,
        purchases: 0
      });
    }
    const entry = acc.get(row.pagePath);
    entry.pageViews += row.pageViews;
    entry.beginCheckout += row.beginCheckout;
    entry.providerSurveySubmissions += row.providerSurveySubmissions || 0;
    entry.purchases += row.purchases;
    return acc;
  }, new Map());

  const pageList = Array.from(pages.values())
    .map((entry) => ({
      ...entry,
      checkoutRate: formatPercentCapped(entry.beginCheckout, entry.pageViews),
      providerSurveyRate: formatPercentCapped(entry.providerSurveySubmissions, entry.pageViews),
      purchaseRate: formatPercentCapped(entry.purchases, entry.pageViews)
    }))
    .sort((left, right) => right.pageViews - left.pageViews)
    .slice(0, 8);

  const funnel = [
    { label: "Landing sessions", value: metrics.landingSessions || metrics.sessions, rate: 100 },
    { label: "CTA seen", value: metrics.ctaImpressionSessions, rate: metrics.ctaVisibilityRate },
    { label: "Checkout started", value: metrics.beginCheckoutSessions, rate: metrics.checkoutRate },
    { label: "Survey submitted", value: metrics.providerSurveySessions, rate: metrics.providerSurveyRate },
    { label: "Purchase verified", value: metrics.purchaseSessions, rate: metrics.purchaseRate }
  ];

  const experiment = buildExperimentSummary(variantRows);

  const timeline = dailyRows.map((row) => ({
    date: row.day,
    sessions: row.landingSessions || row.sessions,
    beginCheckout: row.beginCheckoutSessions,
    purchases: row.purchaseSessions,
    blocked: row.blockedSessions
  }));

  const recent = recentSessions
    .sort((left, right) => right.lastEventAt - left.lastEventAt)
    .slice(0, 18)
    .map((session) => ({
      sessionId: session.sessionId,
      source: session.sourceKey,
      status: summarizeStatus(session),
      experimentName: session.experimentName || "home_landing_hero",
      landingVariant: session.landingVariant || "",
      variantLabel: LANDING_VARIANT_LABELS[session.landingVariant] || "",
      summary: `${session.firstPath || "/"} -> ${session.lastPath || session.firstPath || "/"}`,
      visitorType: session.visitorType,
      deviceType: session.deviceType,
      device: session.device || {
        deviceType: session.deviceType,
        summary: capitalize(session.deviceType || "unknown")
      },
      location: session.location || {
        summary: "Unknown location"
      },
      startedAt: session.startedAt,
      lastEventAt: session.lastEventAt,
      firstPath: session.firstPath,
      lastPath: session.lastPath,
      pagePaths: session.pagePaths || [],
      referrerDomain: session.referrerDomain || "",
      maxScrollPercent: session.maxScrollPercent,
      engagedTimeSeconds: session.engagedTimeSeconds,
      clickCount: session.clickCount,
      pageViews: session.pageViews,
      eventsCount: session.eventsCount,
      blockedReason: session.blockedReason,
      transactionId: session.transactionId,
      clickedTargets: session.clickedTargets || [],
      journey: session.recentJourney || [],
      eventTimeline: session.eventTimeline || [],
      checkoutSteps: Object.keys(session.checkoutStepMap || {}),
      screenCount: (session.pagePaths || []).length,
      viewCount: session.pageViews,
      eventCount: session.eventsCount,
      pathFlow: session.pagePaths || [],
      entry: {
        landingPath: session.firstPath,
        referrerDomain: session.referrerDomain || ""
      }
    }));

  return {
    generatedAt: new Date().toISOString(),
    days,
    metrics,
    funnel,
    experiment,
    timeline,
    sources: sourceList,
    topClicks,
    pages: pageList,
    recentSessions: recent,
    recommendations: buildRecommendations(metrics, sourceList, topClicks, experiment)
  };
}

function isLandingPath(path) {
  return path === "/" || path === "/index.html" || path === "/product/" || path === "/product";
}

export class AnalyticsStore {
  constructor(state) {
    this.state = state;
  }

  async fetch(request) {
    const url = new URL(request.url);

    if (request.method === "POST" && url.pathname.endsWith("/collect")) {
      const payload = await request.json().catch(() => null);
      if (!payload || typeof payload !== "object") {
        return jsonResponse(400, { ok: false, error: "invalid_payload" });
      }

      return this.collect(payload);
    }

    if (request.method === "POST" && url.pathname.endsWith("/dashboard")) {
      const payload = await request.json().catch(() => ({}));
      return this.dashboard(payload);
    }

    if (request.method === "POST" && url.pathname.endsWith("/access-entry")) {
      const payload = await request.json().catch(() => null);
      return this.recordAccessEntry(payload || {});
    }

    if (request.method === "POST" && url.pathname.endsWith("/access-entries")) {
      const payload = await request.json().catch(() => ({}));
      return this.accessEntries(payload || {});
    }

    return jsonResponse(405, { ok: false, error: "method_not_allowed" });
  }

  async recordAccessEntry(input) {
    if (!input || typeof input !== "object") {
      return jsonResponse(400, { ok: false, error: "invalid_payload" });
    }

    const timestamp = asTimestamp(input.unlocked_at || input.time);
    const eventId = normalizeString(input.event_id || `${input.email || "access"}:${timestamp}`, 160);
    const entry = {
      id: eventId,
      name: normalizeString(input.name, 120),
      email: normalizeString(input.email, 160).toLowerCase(),
      pagePath: normalizeString(input.page_path || "/", 180),
      pageUrl: normalizeString(input.page_url || "", 260),
      referrer: normalizeString(input.referrer || "", 260),
      timezone: normalizeString(input.timezone || "", 80),
      language: normalizeString(input.language || "", 40),
      userAgent: normalizeString(input.user_agent || "", 240),
      ip: normalizeString(input.ip || "", 80),
      city: normalizeString(input.city || "", 80),
      region: normalizeString(input.region || "", 80),
      country: normalizeString(input.country || "", 80),
      countryCode: normalizeString(input.country_code || "", 8),
      createdAt: timestamp
    };

    if (!entry.name || (entry.email && !entry.email.includes("@"))) {
      return jsonResponse(400, { ok: false, error: "invalid_access_entry" });
    }

    await this.state.storage.put(accessEntryKey(timestamp, eventId), entry);
    return jsonResponse(202, { ok: true });
  }

  async accessEntries(input) {
    const limit = Math.max(1, Math.min(Number(input.limit) || 100, MAX_ACCESS_ENTRIES));
    const entries = await this.state.storage.list({
      prefix: "access:",
      reverse: true,
      limit
    });

    return jsonResponse(200, {
      ok: true,
      entries: Array.from(entries.values())
    });
  }

  async collect(input) {
    const events = Array.isArray(input.events) ? input.events.slice(0, 50) : [input];
    if (!events.length) {
      return jsonResponse(400, { ok: false, error: "missing_events" });
    }

    let accepted = 0;
    let deduped = 0;
    let rejected = 0;
    let firstError = null;

    for (const eventInput of events) {
      const result = await this.collectOne(eventInput);
      if (result.status === "accepted") {
        accepted += 1;
      } else if (result.status === "deduped") {
        deduped += 1;
      } else {
        rejected += 1;
        if (!firstError) {
          firstError = result;
        }
      }
    }

    if (!accepted && !deduped) {
      return jsonResponse(firstError?.code || 400, {
        ok: false,
        error: firstError?.error || "invalid_payload",
        accepted,
        deduped,
        rejected
      });
    }

    return jsonResponse(202, {
      ok: true,
      accepted,
      deduped,
      rejected
    });
  }

  async collectOne(input) {
    if (!input || typeof input !== "object") {
      return { status: "rejected", code: 400, error: "invalid_event" };
    }

    const payload = input.payload && typeof input.payload === "object" ? input.payload : {};
    const event = normalizeString(input.event || payload.event_name, 80);
    const eventId = normalizeString(payload.event_id || input.event_id, 140);
    const sessionId = normalizeString(payload.session_id || payload.visitor_id || "", 140);

    if (!event || !eventId || !sessionId) {
      return { status: "rejected", code: 400, error: "missing_required_fields" };
    }

    const dedupeKey = dedupeStorageKey(eventId);
    const existingEvent = await this.state.storage.get(dedupeKey);
    if (existingEvent) {
      return { status: "deduped" };
    }

    const timestamp = asTimestamp(payload.event_time || payload.time);
    const day = dayKey(timestamp);
    const sessionKey = sessionStorageKey(sessionId);
    const session = await loadOr(this.state, sessionKey, () => createEmptySession(sessionId, payload, timestamp));
    const previous = cloneValue(session);
    const source = payloadHasAttribution(payload)
      ? sourceSummaryFromPayload(payload)
      : {
        source: session.source,
        medium: session.medium,
        campaign: session.campaign,
        key: session.sourceKey
      };
    const currentPath = normalizeString(payload.page_path || payload.page_location || session.lastPath || "/", 140) || "/";
    const payloadVariant = normalizeLandingVariant(payload.landing_variant);
    if (payloadVariant) {
      session.landingVariant = payloadVariant;
    }
    session.experimentName = normalizeString(payload.experiment_name || session.experimentName || "", 80);

    session.eventsCount += 1;
    session.lastEventAt = timestamp;
    session.lastPath = currentPath;
    session.source = source.source || session.source;
    session.medium = source.medium || session.medium;
    session.campaign = source.campaign || session.campaign;
    session.sourceKey = source.key || session.sourceKey;
    session.referrerDomain = normalizeString(payload.referrer_domain || session.referrerDomain, 120) || session.referrerDomain;
    session.deviceType = normalizeDeviceType(payload.device_type || session.deviceType);
    session.language = normalizeString(payload.language || session.language, 24) || session.language;
    session.device = {
      ...(session.device || {}),
      ...normalizeDeviceFromPayload({
        ...(session.device || {}),
        ...payload,
        device_type: payload.device_type || session.deviceType,
        language: payload.language || session.language,
        timezone: payload.timezone || session.device?.timezone || "",
        browser_timezone: payload.browser_timezone || session.device?.timezone || ""
      })
    };
    session.location = {
      ...(session.location || {}),
      ...normalizeLocationFromPayload({
        ...(session.location || {}),
        ...payload
      })
    };
    session.pagePaths = pushUniqueLimited(session.pagePaths, session.lastPath, MAX_UNIQUE_ITEMS);
    session.eventTimeline = appendTimeline(
      session.eventTimeline,
      eventTimelineEntry(event, timestamp, payload, currentPath),
      MAX_TIMELINE_EVENTS
    );

    switch (event) {
      case "page_view":
        session.pageViews += 1;
        session.firstPath = session.firstPath || session.lastPath;
        session.recentJourney = appendJourney(session.recentJourney, `view ${session.lastPath}`, 12);
        break;
      case "view_item":
        session.recentJourney = appendJourney(session.recentJourney, "product viewed", 12);
        break;
      case "cta_impression":
        session.ctaImpression = true;
        session.recentJourney = appendJourney(session.recentJourney, "cta seen", 12);
        break;
      case "begin_checkout":
        session.beginCheckout = true;
        session.checkoutStepMap = {
          ...(session.checkoutStepMap || {}),
          started: true
        };
        session.recentJourney = appendJourney(session.recentJourney, "checkout started", 12);
        break;
      case "provider_survey_submitted":
        session.providerSurveySubmitted = true;
        session.checkoutStepMap = {
          ...(session.checkoutStepMap || {}),
          provider_survey_submitted: true
        };
        session.recentJourney = appendJourney(session.recentJourney, "provider survey submitted", 12);
        break;
      case "checkout_redirect":
        session.checkoutRedirect = true;
        session.checkoutStepMap = {
          ...(session.checkoutStepMap || {}),
          redirected: true
        };
        session.recentJourney = appendJourney(session.recentJourney, "redirected to stripe", 12);
        break;
      case "purchase_pending_approval":
      case "purchase_verified":
        session.purchaseVerified = true;
        session.purchaseValue = normalizeNumber(payload.value, session.purchaseValue);
        session.transactionId = normalizeString(payload.transaction_id || payload.order_id || "", 160);
        session.checkoutStepMap = {
          ...(session.checkoutStepMap || {}),
          purchased: true
        };
        session.recentJourney = appendJourney(session.recentJourney, "purchase verified", 12);
        break;
      case "checkout_blocked":
        session.checkoutBlocked = true;
        session.blockedReason = normalizeString(payload.reason || "", 160);
        session.recentJourney = appendJourney(session.recentJourney, "checkout blocked", 12);
        break;
      case "scroll_depth":
        session.maxScrollPercent = Math.max(session.maxScrollPercent, normalizeNumber(payload.percent_scrolled));
        if (session.maxScrollPercent >= 50) {
          session.deepScroll = true;
        }
        break;
      case "engagement_milestone":
        session.engagedTimeSeconds = Math.max(session.engagedTimeSeconds, normalizeNumber(payload.milestone_seconds));
        if (session.engagedTimeSeconds >= 30) {
          session.engaged30 = true;
        }
        break;
      case "page_exit":
        session.engagedTimeSeconds = Math.max(session.engagedTimeSeconds, normalizeNumber(payload.engaged_time_seconds));
        session.maxScrollPercent = Math.max(session.maxScrollPercent, normalizeNumber(payload.max_scroll_percent));
        if (session.maxScrollPercent >= 50) {
          session.deepScroll = true;
        }
        if (session.engagedTimeSeconds >= 30) {
          session.engaged30 = true;
        }
        break;
      case "carousel_interaction":
        session.carouselInteractions += 1;
        session.recentJourney = appendJourney(session.recentJourney, "carousel used", 12);
        break;
      case "click_target":
        session.clickCount += 1;
        session.clickedTargets = pushUniqueLimited(
          session.clickedTargets,
          normalizeString(payload.target_label || "Unknown", 120),
          MAX_UNIQUE_ITEMS
        );
        session.recentJourney = appendJourney(
          session.recentJourney,
          `clicked ${normalizeString(payload.target_label || "target", 60)}`,
          12
        );
        break;
      case "checkout_step_completed":
        session.checkoutStepMap = {
          ...(session.checkoutStepMap || {}),
          [normalizeString(payload.step || "unknown", 40)]: true
        };
        session.recentJourney = appendJourney(
          session.recentJourney,
          `step ${normalizeString(payload.step || "unknown", 40)} complete`,
          12
        );
        break;
      default:
        session.recentJourney = appendJourney(session.recentJourney, event, 12);
        break;
    }

    const daily = await loadOr(this.state, dailyStorageKey(day), () => createEmptyDaily(day));
    const sourceRow = await loadOr(
      this.state,
      sourceStorageKey(day, session.sourceKey),
      () => createEmptySource(day, session.sourceKey, session.source, session.medium, session.campaign)
    );
    const pagePathForCounts = event === "purchase_verified" ? (session.firstPath || currentPath) : currentPath;
    const pageRow = await loadOr(
      this.state,
      pageStorageKey(day, pagePathForCounts),
      () => createEmptyPage(day, pagePathForCounts)
    );
    const variantForCounts = session.landingVariant || "unknown";
    const variantRow = await loadOr(
      this.state,
      variantStorageKey(day, variantForCounts),
      () => createEmptyVariant(day, variantForCounts)
    );

    daily.totalEvents += 1;

    if (event === "page_view") {
      daily.pageViews += 1;
      pageRow.pageViews += 1;
      variantRow.pageViews += 1;
      if (previous.pageViews === 0) {
        daily.sessions += 1;
        sourceRow.sessions += 1;
        variantRow.sessions += 1;
        if (session.visitorType === "returning") {
          daily.returningSessions += 1;
        } else {
          daily.newSessions += 1;
        }
        if (isLandingPath(currentPath)) {
          daily.landingSessions += 1;
        }
      }
    }

    if (session.ctaImpression && !previous.ctaImpression) {
      daily.ctaImpressionSessions += 1;
      variantRow.ctaImpressionSessions += 1;
    }
    if (session.beginCheckout && !previous.beginCheckout) {
      daily.beginCheckoutSessions += 1;
      sourceRow.beginCheckout += 1;
      pageRow.beginCheckout += 1;
      variantRow.beginCheckoutSessions += 1;
    }
    if (session.providerSurveySubmitted && !previous.providerSurveySubmitted) {
      daily.providerSurveySessions = normalizeNumber(daily.providerSurveySessions) + 1;
      sourceRow.providerSurveySubmissions = normalizeNumber(sourceRow.providerSurveySubmissions) + 1;
      pageRow.providerSurveySubmissions = normalizeNumber(pageRow.providerSurveySubmissions) + 1;
      variantRow.providerSurveySubmissions = normalizeNumber(variantRow.providerSurveySubmissions) + 1;
    }
    if (session.checkoutRedirect && !previous.checkoutRedirect) {
      daily.checkoutRedirectSessions += 1;
    }
    if (session.purchaseVerified && !previous.purchaseVerified) {
      daily.purchaseSessions += 1;
      sourceRow.purchases += 1;
      pageRow.purchases += 1;
      variantRow.purchaseSessions += 1;
    }
    if (session.checkoutBlocked && !previous.checkoutBlocked) {
      daily.blockedSessions += 1;
      sourceRow.blocked += 1;
      variantRow.blockedSessions += 1;
    }
    if (session.deepScroll && !previous.deepScroll) {
      daily.deepScrollSessions += 1;
      variantRow.deepScrollSessions += 1;
    }
    if (session.engaged30 && !previous.engaged30) {
      daily.engagedSessions += 1;
      variantRow.engagedSessions += 1;
    }
    if (session.carouselInteractions > 0 && previous.carouselInteractions === 0) {
      daily.carouselSessions += 1;
      variantRow.carouselSessions += 1;
    }
    if (event === "page_exit") {
      daily.totalEngagedSeconds += normalizeNumber(payload.engaged_time_seconds);
      daily.exitCount += 1;
    }

    if (event === "click_target") {
      const label = normalizeString(payload.target_label || "Unknown", 120);
      const href = normalizeString(payload.target_href || "", 240);
      const clickKey = `${label}:::${href}`;
      const clickRow = await loadOr(
        this.state,
        clickStorageKey(day, clickKey),
        () => createEmptyClick(day, label, href, currentPath)
      );
      clickRow.clicks += 1;
      await this.state.storage.put(clickStorageKey(day, clickKey), clickRow);
    }

    await this.state.storage.put(dedupeKey, { timestamp, day });
    await this.state.storage.put(sessionKey, session);
    await this.state.storage.put(dailyStorageKey(day), daily);
    await this.state.storage.put(sourceStorageKey(day, session.sourceKey), sourceRow);
    await this.state.storage.put(pageStorageKey(day, pagePathForCounts), pageRow);
    await this.state.storage.put(variantStorageKey(day, variantForCounts), variantRow);
    await updateRecentSessions(this.state, session);

    return { status: "accepted" };
  }

  async dashboard(input) {
    const days = normalizeDays(input.days);
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    const dayKeys = Array.from({ length: days }, (_, index) => {
      const date = new Date();
      date.setUTCDate(date.getUTCDate() - (days - index - 1));
      return dayKey(date.getTime());
    });

    const dailyRows = [];
    const sourceRows = [];
    const clickRows = [];
    const pageRows = [];
    const variantRows = [];

    for (const day of dayKeys) {
      const daily = await loadOr(this.state, dailyStorageKey(day), () => createEmptyDaily(day));
      dailyRows.push(daily);

      const sources = await this.state.storage.list({ prefix: `source:${day}:` });
      sourceRows.push(...Array.from(sources.values()));

      const clicks = await this.state.storage.list({ prefix: `click:${day}:` });
      clickRows.push(...Array.from(clicks.values()));

      const pages = await this.state.storage.list({ prefix: `page:${day}:` });
      pageRows.push(...Array.from(pages.values()));

      const variants = await this.state.storage.list({ prefix: `variant:${day}:` });
      variantRows.push(...Array.from(variants.values()));
    }

    const recentIds = (await this.state.storage.get("recent_sessions")) || [];
    const recentSessions = [];
    for (const entry of recentIds) {
      if (!entry || entry.lastEventAt < cutoff) continue;
      const session = await this.state.storage.get(sessionStorageKey(entry.sessionId));
      if (session && session.lastEventAt >= cutoff) {
        recentSessions.push(session);
      }
    }

    return jsonResponse(200, {
      ok: true,
      dashboard: buildDashboardFromData(days, dailyRows, sourceRows, clickRows, pageRows, variantRows, recentSessions)
    });
  }
}

export async function handleAnalyticsCollect(request, env) {
  const id = env.ANALYTICS_STORE.idFromName("analytics");
  const stub = env.ANALYTICS_STORE.get(id);
  const payload = await request.json().catch(() => null);
  const cf = request.cf || {};
  const userAgent = request.headers.get("user-agent") || "";
  const origin = request.headers.get("origin") || "";
  const referer = request.headers.get("referer") || "";
  const enrichedPayload = {
    ...(payload && typeof payload === "object" ? payload : {}),
    user_agent: (payload && payload.user_agent) || userAgent,
    request_origin: origin,
    request_referrer: referer,
    ip: (payload && payload.ip) || request.headers.get("cf-connecting-ip") || "",
    city: (payload && payload.city) || cf.city || "",
    region: (payload && payload.region) || cf.region || "",
    country: (payload && payload.country) || cf.country || "",
    country_code: (payload && payload.country_code) || cf.countryCode || "",
    timezone: (payload && payload.timezone) || cf.timezone || "",
    browser_timezone: (payload && payload.timezone) || cf.timezone || "",
    browser: (payload && payload.browser) || "",
    os: (payload && payload.os) || ""
  };
  return stub.fetch("https://analytics/collect", {
    method: "POST",
    body: JSON.stringify(enrichedPayload)
  });
}

export async function handleAccessEntry(request, env) {
  const id = env.ANALYTICS_STORE.idFromName("analytics");
  const stub = env.ANALYTICS_STORE.get(id);
  const payload = await request.json().catch(() => null);
  const cf = request.cf || {};
  const enrichedPayload = {
    ...(payload && typeof payload === "object" ? payload : {}),
    user_agent: (payload && payload.user_agent) || request.headers.get("user-agent") || "",
    ip: (payload && payload.ip) || request.headers.get("cf-connecting-ip") || "",
    city: (payload && payload.city) || cf.city || "",
    region: (payload && payload.region) || cf.region || "",
    country: (payload && payload.country) || cf.country || "",
    country_code: (payload && payload.country_code) || cf.countryCode || "",
    timezone: (payload && payload.timezone) || cf.timezone || ""
  };

  return stub.fetch("https://analytics/access-entry", {
    method: "POST",
    body: JSON.stringify(enrichedPayload)
  });
}

export async function handleAccessEntries(request, env) {
  const id = env.ANALYTICS_STORE.idFromName("analytics");
  const stub = env.ANALYTICS_STORE.get(id);
  const payload = await request.json().catch(() => ({}));
  return stub.fetch("https://analytics/access-entries", {
    method: "POST",
    body: JSON.stringify(payload || {})
  });
}

export function analyticsCorsHeaders(headers, origin) {
  if (!origin) return headers;
  headers.set("Access-Control-Allow-Origin", origin);
  headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Dashboard-Secret");
  headers.set("Vary", "Origin");
  return headers;
}
