const TRACKED_EVENTS = new Set([
  "page_view",
  "view_item",
  "cta_impression",
  "begin_checkout",
  "checkout_blocked",
  "checkout_link_missing",
  "scroll_depth",
  "engagement_milestone",
  "carousel_loaded",
  "carousel_interaction",
  "legal_click",
  "link_click",
  "entry_offer_viewed",
  "entry_offer_goal_selected",
  "entry_offer_email_submitted",
  "entry_offer_phone_submitted",
  "entry_offer_completed",
  "entry_offer_closed",
  "page_exit",
]);

const CLICK_EVENTS = new Set([
  "begin_checkout",
  "checkout_blocked",
  "checkout_link_missing",
  "carousel_interaction",
  "legal_click",
  "link_click",
  "entry_offer_goal_selected",
  "entry_offer_email_submitted",
  "entry_offer_phone_submitted",
  "entry_offer_completed",
  "entry_offer_closed",
]);

function toNumber(value, fallback = 0) {
  const next = Number(value);
  return Number.isFinite(next) ? next : fallback;
}

function toMillis(value) {
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

function dayKey(value) {
  return new Date(value).toISOString().slice(0, 10);
}

function formatPercent(numerator, denominator) {
  if (!denominator) return 0;
  return Number(((numerator / denominator) * 100).toFixed(1));
}

function createCounterMap() {
  return new Map();
}

function increment(map, key, value = 1) {
  map.set(key, (map.get(key) || 0) + value);
}

function firstNonEmpty(...values) {
  for (const value of values) {
    if (value === null || value === undefined) continue;
    const stringValue = String(value).trim();
    if (stringValue) return stringValue;
  }
  return "";
}

function getProp(props, keys, fallback = "") {
  for (const key of keys) {
    if (props[key] !== undefined && props[key] !== null) {
      const value = String(props[key]).trim();
      if (value) return value;
    }
  }
  return fallback;
}

function getNumberProp(props, keys, fallback = 0) {
  for (const key of keys) {
    const value = props[key];
    if (value === undefined || value === null || value === "") continue;
    const next = Number(value);
    if (Number.isFinite(next)) return next;
  }
  return fallback;
}

function getSessionKey(props) {
  return firstNonEmpty(props.session_id, props.distinct_id, props.visitor_id, props.$insert_id);
}

function getVisitorKey(props) {
  return firstNonEmpty(props.distinct_id, props.visitor_id, props.session_id);
}

function normalizePathFromUrl(value) {
  if (!value) return "";

  try {
    const url = new URL(String(value));
    const path = url.pathname.replace(/\/+$/, "");
    return path || "/";
  } catch (error) {
    const raw = String(value);
    if (raw.startsWith("/")) {
      return raw.replace(/\/+$/, "") || "/";
    }
    return "";
  }
}

function normalizePagePath(props) {
  return firstNonEmpty(
    normalizePathFromUrl(props.page_path),
    normalizePathFromUrl(props.page_location),
    normalizePathFromUrl(props.$current_url),
    normalizePathFromUrl(props.click_href)
  );
}

function normalizeSource(props) {
  const source = getProp(props, ["last_source", "first_source"], "direct") || "direct";
  const medium = getProp(props, ["last_medium", "first_medium"], "direct") || "direct";
  const campaign = getProp(props, ["last_campaign", "first_campaign"], "");

  return {
    source,
    medium,
    campaign,
    key: campaign ? `${source} / ${medium} / ${campaign}` : `${source} / ${medium}`,
  };
}

function normalizeDevice(props) {
  const userAgent = getProp(props, ["user_agent", "$user_agent"], "");
  const browser = getProp(props, ["browser", "$browser"], inferBrowser(userAgent));
  const browserVersion = getProp(props, ["browser_version", "$browser_version"], "");
  const os = getProp(props, ["os", "$os"], inferOs(userAgent));
  const deviceType =
    getProp(props, ["device_type", "$device_type"], inferDeviceType(userAgent, props)) || "unknown";
  const viewportWidth = getNumberProp(props, ["viewport_width"], 0);
  const viewportHeight = getNumberProp(props, ["viewport_height"], 0);
  const screenWidth = getNumberProp(props, ["screen_width"], viewportWidth);
  const screenHeight = getNumberProp(props, ["screen_height"], viewportHeight);
  const language = getProp(props, ["language", "locale", "$language"], "");
  const timezone = getProp(props, ["timezone", "$timezone"], "");
  const touchPoints = getNumberProp(props, ["touch_points"], 0);
  const devicePixelRatio = getNumberProp(props, ["device_pixel_ratio"], 1);

  return {
    browser,
    browserVersion,
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
  };
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

function inferDeviceType(userAgent, props) {
  const ua = String(userAgent || "");
  const viewportWidth = getNumberProp(props, ["viewport_width"], 0);
  if (/ipad|tablet/i.test(ua)) return "Tablet";
  if (/mobi|iphone|android/i.test(ua) || viewportWidth > 0 && viewportWidth < 768) return "Mobile";
  if (viewportWidth >= 768 && viewportWidth < 1200) return "Tablet";
  if (viewportWidth >= 1200) return "Desktop";
  return "";
}

function normalizeLocation(props) {
  const city = getProp(props, ["$city", "city", "geo_city"], "");
  const region = getProp(props, ["$region", "region", "geo_region"], "");
  const country = getProp(props, ["$country_name", "$country", "country", "geo_country"], "");
  const countryCode = getProp(
    props,
    ["$country_code", "country_code", "geo_country_code"],
    ""
  );
  const timezone = getProp(props, ["$timezone", "timezone", "browser_timezone"], "");
  const ip = getProp(props, ["ip", "client_ip", "request_ip"], "");

  let summary = "";
  if (city && region) summary = `${city}, ${region}`;
  else if (city && country) summary = `${city}, ${country}`;
  else if (region && country) summary = `${region}, ${country}`;
  else summary = firstNonEmpty(city, region, country, countryCode, "Unknown");

  return {
    city,
    region,
    country,
    countryCode,
    timezone,
    ip,
    summary,
  };
}

function normalizeLinkSummary(props) {
  const href = firstNonEmpty(props.click_href, props.checkout_url, props.configured_checkout_url, "");
  const text = firstNonEmpty(props.click_text, props.cta_label, props.item_name, "");
  const location = firstNonEmpty(props.click_location, props.cta_location, "");
  return {
    href,
    text,
    location,
    label: text || href || location || "Link",
  };
}

function humanizeSegment(segment) {
  return String(segment || "")
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (match) => match.toUpperCase())
    .trim();
}

function humanizePath(path) {
  const normalized = String(path || "").trim();
  if (!normalized || normalized === "/") return "Home";

  return normalized
    .replace(/^https?:\/\/[^/]+/i, "")
    .replace(/^\/+/, "")
    .replace(/\/+$/, "")
    .split("/")
    .filter(Boolean)
    .map(humanizeSegment)
    .join(" / ");
}

function getScreenLabel(props, path) {
  return firstNonEmpty(
    props.page_title,
    props.page_name,
    path ? humanizePath(path) : "",
    "Unknown screen"
  );
}

function getEventLabel(event, props) {
  switch (event) {
    case "page_view":
      return "Page view";
    case "view_item":
      return "Product view";
    case "cta_impression":
      return "CTA seen";
    case "begin_checkout":
      return "Checkout started";
    case "checkout_blocked":
      return "Checkout blocked";
    case "checkout_link_missing":
      return "Checkout link missing";
    case "scroll_depth":
      return `Scrolled ${toNumber(props.percent_scrolled)}%`;
    case "engagement_milestone":
      return `Stayed ${toNumber(props.milestone_seconds)}s`;
    case "carousel_loaded":
      return "Carousel loaded";
    case "carousel_interaction":
      return "Carousel interaction";
    case "legal_click":
      return "Legal link clicked";
    case "link_click":
      return "Link clicked";
    case "entry_offer_viewed":
      return "Offer viewed";
    case "entry_offer_goal_selected":
      return "Offer goal selected";
    case "entry_offer_email_submitted":
      return "Offer email submitted";
    case "entry_offer_phone_submitted":
      return "Offer phone submitted";
    case "entry_offer_completed":
      return "Offer completed";
    case "entry_offer_closed":
      return "Offer closed";
    case "page_exit":
      return "Page exit";
    default:
      return humanizeSegment(event);
  }
}

function getEventDetail(event, props) {
  switch (event) {
    case "page_view":
      return firstNonEmpty(props.page_path, props.page_location, props.page_name, "");
    case "view_item":
      return firstNonEmpty(props.item_name, props.page_title, props.page_path, "");
    case "cta_impression":
      return firstNonEmpty(props.cta_label, props.cta_location, "");
    case "begin_checkout":
      return firstNonEmpty(props.checkout_url, props.cta_label, props.cta_location, "");
    case "checkout_blocked":
      return firstNonEmpty(props.reason, props.checkout_url, "");
    case "checkout_link_missing":
      return firstNonEmpty(props.configured_checkout_url, "");
    case "scroll_depth":
      return `${toNumber(props.percent_scrolled)}%`;
    case "engagement_milestone":
      return `${toNumber(props.milestone_seconds)}s`;
    case "carousel_interaction":
      return firstNonEmpty(props.interaction_type, `Slide ${toNumber(props.slide_index)}`, "");
    case "link_click":
    case "legal_click":
      return firstNonEmpty(props.click_href, props.click_text, props.click_location, "");
    case "entry_offer_viewed":
      return firstNonEmpty(props.path, "", "");
    case "entry_offer_goal_selected":
      return firstNonEmpty(props.goal, props.selected_goal, "");
    case "entry_offer_email_submitted":
      return firstNonEmpty(props.email_domain, "");
    case "entry_offer_phone_submitted":
      return firstNonEmpty(props.selected_goal, props.email_domain, "");
    case "entry_offer_completed":
      return firstNonEmpty(props.email_domain, props.selected_goal, "");
    case "entry_offer_closed":
      return props.completed ? "Completed" : "Closed";
    case "page_exit":
      return `Engaged ${toNumber(props.engaged_time_seconds)}s | max ${toNumber(props.max_scroll_percent)}%`;
    default:
      return "";
  }
}

function buildEventSummary(entry) {
  const props = entry.properties || {};
  const event = String(entry.event || "");
  const occurredAt = toMillis(props.time || props.event_time || props.timestamp || entry.time);
  const path = normalizePagePath(props);

  return {
    event,
    at: new Date(occurredAt).toISOString(),
    timestamp: occurredAt,
    label: getEventLabel(event, props),
    detail: getEventDetail(event, props),
    pagePath: path,
    pageTitle: firstNonEmpty(props.page_title, props.page_name, ""),
    linkHref: firstNonEmpty(props.click_href, props.checkout_url, props.configured_checkout_url, ""),
    linkText: firstNonEmpty(props.click_text, props.cta_label, props.item_name, ""),
    scrollPercent: getNumberProp(props, ["percent_scrolled", "max_scroll_percent"], 0),
    milestoneSeconds: getNumberProp(props, ["milestone_seconds"], 0),
    engagedSeconds: getNumberProp(props, ["engaged_time_seconds"], 0),
  };
}

function upsertScreen(session, props, eventSummary) {
  const path = eventSummary.pagePath || normalizePagePath(props) || "";
  const label = getScreenLabel(props, path);
  const screenKey = path || label;

  if (!session.screenMap.has(screenKey)) {
    session.screenMap.set(screenKey, {
      key: screenKey,
      path,
      label,
      title: firstNonEmpty(props.page_title, ""),
      name: firstNonEmpty(props.page_name, ""),
      views: 0,
      clicks: 0,
      scrollMax: 0,
      eventCount: 0,
      firstSeenAt: eventSummary.timestamp,
      lastSeenAt: eventSummary.timestamp,
      links: new Map(),
      events: [],
    });
  }

  const screen = session.screenMap.get(screenKey);
  screen.eventCount += 1;
  screen.firstSeenAt = Math.min(screen.firstSeenAt, eventSummary.timestamp);
  screen.lastSeenAt = Math.max(screen.lastSeenAt, eventSummary.timestamp);
  screen.events.push(eventSummary);

  if (eventSummary.event === "page_view" || eventSummary.event === "view_item") {
    screen.views += 1;
  }

  if (CLICK_EVENTS.has(eventSummary.event)) {
    screen.clicks += 1;
  }

  if (eventSummary.event === "scroll_depth") {
    screen.scrollMax = Math.max(screen.scrollMax, eventSummary.scrollPercent);
  }

  if (eventSummary.event === "page_exit") {
    screen.scrollMax = Math.max(screen.scrollMax, getNumberProp(props, ["max_scroll_percent"], 0));
  }

  if (eventSummary.linkHref) {
    const linkKey = `${eventSummary.linkHref}::${eventSummary.linkText}`;
    if (!screen.links.has(linkKey)) {
      screen.links.set(linkKey, {
        href: eventSummary.linkHref,
        text: eventSummary.linkText,
        location: firstNonEmpty(props.click_location, props.cta_location, ""),
        count: 0,
      });
    }
    const link = screen.links.get(linkKey);
    link.count += 1;
  }
}

function upsertSessionContext(session, props) {
  const source = normalizeSource(props);
  const device = normalizeDevice(props);
  const location = normalizeLocation(props);

  if (!session.source.first && source) {
    session.source.first = source;
  }
  session.source.last = source;

  if (!session.device.browser && device.browser) session.device.browser = device.browser;
  if (!session.device.browserVersion && device.browserVersion) {
    session.device.browserVersion = device.browserVersion;
  }
  if (!session.device.os && device.os) session.device.os = device.os;
  if (!session.device.deviceType && device.deviceType) session.device.deviceType = device.deviceType;
  if (!session.device.userAgent && device.userAgent) session.device.userAgent = device.userAgent;
  session.device.viewportWidth = Math.max(session.device.viewportWidth || 0, device.viewportWidth || 0);
  session.device.viewportHeight = Math.max(session.device.viewportHeight || 0, device.viewportHeight || 0);
  session.device.screenWidth = Math.max(session.device.screenWidth || 0, device.screenWidth || 0);
  session.device.screenHeight = Math.max(session.device.screenHeight || 0, device.screenHeight || 0);
  session.device.language = firstNonEmpty(session.device.language, device.language);
  session.device.timezone = firstNonEmpty(session.device.timezone, device.timezone);
  session.device.touchPoints = Math.max(session.device.touchPoints || 0, device.touchPoints || 0);
  session.device.devicePixelRatio = Math.max(session.device.devicePixelRatio || 0, device.devicePixelRatio || 0);

  if (!session.location.city && location.city) session.location.city = location.city;
  if (!session.location.region && location.region) session.location.region = location.region;
  if (!session.location.country && location.country) session.location.country = location.country;
  if (!session.location.countryCode && location.countryCode) session.location.countryCode = location.countryCode;
  if (!session.location.timezone && location.timezone) session.location.timezone = location.timezone;
  if (!session.location.ip && location.ip) session.location.ip = location.ip;
  if (!session.location.summary || session.location.summary === "Unknown") {
    session.location.summary = location.summary;
  }

  if (!session.entry.landingPath) {
    session.entry.landingPath = firstNonEmpty(props.page_path, props.page_location, props.$current_url, "");
  }
  if (!session.entry.landingUrl) {
    session.entry.landingUrl = firstNonEmpty(props.page_location, props.$current_url, "");
  }
  if (!session.entry.referrerDomain) {
    session.entry.referrerDomain = firstNonEmpty(props.referrer_domain, props.$referrer_domain, "");
  }
  if (!session.entry.referrerUrl) {
    session.entry.referrerUrl = firstNonEmpty(props.$referrer, props.referer, "");
  }
  if (!session.entry.checkoutUrl) {
    session.entry.checkoutUrl = firstNonEmpty(props.checkout_url, props.configured_checkout_url, "");
  }
}

function summarizeSession(session) {
  const screens = Array.from(session.screenMap.values())
    .sort((left, right) => left.firstSeenAt - right.firstSeenAt)
    .map((screen) => ({
      key: screen.key,
      label: screen.label,
      title: screen.title,
      name: screen.name,
      path: screen.path,
      views: screen.views,
      clicks: screen.clicks,
      scrollMax: screen.scrollMax,
      eventCount: screen.eventCount,
      firstSeenAt: new Date(screen.firstSeenAt).toISOString(),
      lastSeenAt: new Date(screen.lastSeenAt).toISOString(),
      links: Array.from(screen.links.values())
        .sort((left, right) => right.count - left.count)
        .map((link) => ({
          href: link.href,
          text: link.text,
          location: link.location,
          count: link.count,
        })),
      events: screen.events.map((event) => ({
        at: event.at,
        label: event.label,
        detail: event.detail,
        event: event.event,
        linkHref: event.linkHref,
        scrollPercent: event.scrollPercent,
        milestoneSeconds: event.milestoneSeconds,
        engagedSeconds: event.engagedSeconds,
      })),
    }));

  const pages = screens.map((screen, index) => {
    const exitSeconds = Math.max(
      0,
      ...screen.events
        .filter((event) => event.event === "page_exit")
        .map((event) => toNumber(event.engagedSeconds))
    );
    const nextScreen = screens[index + 1];
    const transitionSeconds = nextScreen
      ? Number(((nextScreen.firstSeenAt - new Date(screen.firstSeenAt).getTime()) / 1000).toFixed(1))
      : 0;
    const durationSeconds = Number(
      Math.max(
        0,
        exitSeconds || transitionSeconds || (new Date(screen.lastSeenAt).getTime() - new Date(screen.firstSeenAt).getTime()) / 1000
      ).toFixed(1)
    );

    return {
      key: screen.key,
      label: screen.label,
      path: screen.path,
      title: screen.title,
      durationSeconds,
      clickCount: screen.clicks,
      eventCount: screen.eventCount,
      scrollMax: screen.scrollMax,
      firstSeenAt: screen.firstSeenAt,
      lastSeenAt: screen.lastSeenAt,
      links: screen.links.slice(0, 3),
    };
  });

  const totalPageTimeSeconds = Number(
    pages.reduce((sum, page) => sum + toNumber(page.durationSeconds), 0).toFixed(1)
  );

  const eventTimeline = session.timeline
    .slice()
    .sort((left, right) => left.timestamp - right.timestamp)
    .map((event) => ({
      at: new Date(event.timestamp).toISOString(),
      label: event.label,
      detail: event.detail,
      event: event.event,
      pagePath: event.pagePath,
      pageTitle: event.pageTitle,
      linkHref: event.linkHref,
      linkText: event.linkText,
      scrollPercent: event.scrollPercent,
      milestoneSeconds: event.milestoneSeconds,
      engagedSeconds: event.engagedSeconds,
    }));

  const clickEvents = eventTimeline.filter((event) => CLICK_EVENTS.has(event.event));
  const linkEvents = eventTimeline.filter((event) => event.linkHref);
  const pageFlow = screens.map((screen) => screen.label);
  const pathFlow = screens.map((screen) => screen.path || screen.label);
  const durationSeconds = session.firstSeenAt && session.lastSeenAt
    ? Number(((session.lastSeenAt - session.firstSeenAt) / 1000).toFixed(1))
    : 0;
  const scrollMax = Math.max(
    0,
    ...eventTimeline.map((event) => toNumber(event.scrollPercent)),
    ...screens.map((screen) => toNumber(screen.scrollMax))
  );

  const device = {
    browser: session.device.browser || "",
    browserVersion: session.device.browserVersion || "",
    os: session.device.os || "",
    deviceType: session.device.deviceType || inferDeviceType(session.device.userAgent, {}) || "",
    viewportWidth: session.device.viewportWidth || 0,
    viewportHeight: session.device.viewportHeight || 0,
    screenWidth: session.device.screenWidth || 0,
    screenHeight: session.device.screenHeight || 0,
    language: session.device.language || "",
    timezone: session.device.timezone || "",
    touchPoints: session.device.touchPoints || 0,
    devicePixelRatio: session.device.devicePixelRatio || 1,
    userAgent: session.device.userAgent || "",
    summary: buildDeviceSummary(session.device),
  };

  const location = {
    city: session.location.city || "",
    region: session.location.region || "",
    country: session.location.country || "",
    countryCode: session.location.countryCode || "",
    timezone: session.location.timezone || "",
    ip: session.location.ip || "",
    summary: session.location.summary || "Unknown",
  };

  const source =
    session.source.first && session.source.first.key !== "direct / direct"
      ? session.source.first
      : session.source.last || session.source.first || normalizeSource({});
  const entry = {
    landingPath: session.entry.landingPath || "",
    landingUrl: session.entry.landingUrl || "",
    referrerDomain: session.entry.referrerDomain || "",
    referrerUrl: session.entry.referrerUrl || "",
    checkoutUrl: session.entry.checkoutUrl || "",
  };

  const clickCount = eventTimeline.filter((event) => CLICK_EVENTS.has(event.event)).length;
  const viewCount = eventTimeline.filter((event) => event.event === "page_view" || event.event === "view_item").length;
  const scrollCount = eventTimeline.filter((event) => event.event === "scroll_depth").length;

  return {
    key: session.key,
    sessionId: session.sessionId || session.key,
    visitorId: session.visitorId || "",
    visitorType: session.visitorType || "",
    firstSeenAt: new Date(session.firstSeenAt).toISOString(),
    lastSeenAt: new Date(session.lastSeenAt).toISOString(),
    durationSeconds,
    eventCount: session.eventCount,
    viewCount,
    clickCount,
    scrollCount,
    scrollMax,
    screenCount: screens.length,
    screens,
    pages,
    totalPageTimeSeconds,
    eventTimeline,
    pageFlow,
    pathFlow,
    source: {
      source: source.source || "direct",
      medium: source.medium || "direct",
      campaign: source.campaign || "",
      key: source.key || "direct / direct",
    },
    entry,
    device,
    location,
    referrerDomain: entry.referrerDomain || "",
    referrerUrl: entry.referrerUrl || "",
    checkoutUrl: entry.checkoutUrl || "",
    links: dedupeLinks(linkEvents),
    clicks: clickEvents,
    topEvents: eventTimeline.slice(0, 8),
    summary: buildSessionSummary({
      screens,
      device,
      location,
      durationSeconds,
      clickCount,
      scrollMax,
      viewCount,
      source,
      entry,
    }),
  };
}

function buildDeviceSummary(device) {
  const parts = [
    device.deviceType,
    device.browser,
    device.os,
    device.viewportWidth && device.viewportHeight
      ? `${device.viewportWidth}x${device.viewportHeight}`
      : "",
  ].filter(Boolean);

  return parts.join(" | ") || "Unknown device";
}

function dedupeLinks(linkEvents) {
  const seen = new Map();
  linkEvents.forEach((event) => {
    const key = `${event.linkHref}::${event.linkText}`;
    if (!seen.has(key)) {
      seen.set(key, {
        href: event.linkHref,
        text: event.linkText,
        location: firstNonEmpty(event.pagePath, event.pageTitle, ""),
        count: 0,
      });
    }
    seen.get(key).count += 1;
  });

  return Array.from(seen.values())
    .sort((left, right) => right.count - left.count)
    .map((link) => ({
      href: link.href,
      text: link.text,
      location: link.location,
      count: link.count,
    }));
}

function buildSessionSummary({ screens, device, location, durationSeconds, clickCount, scrollMax, viewCount, source, entry }) {
  const firstScreen = screens[0];
  const screenSummary = screens.length
    ? `${screens.length} screen${screens.length === 1 ? "" : "s"}`
    : "No screens";
  const clickSummary = `${clickCount} click${clickCount === 1 ? "" : "s"}`;
  const durationLabel = durationSeconds > 0 ? `${durationSeconds}s` : "under 1s";
  const sourceLabel = source?.key || "direct / direct";
  const locationLabel = location?.summary || "Unknown location";
  const deviceLabel = device?.summary || "Unknown device";
  const entryLabel = entry?.landingPath || entry?.landingUrl || "";

  const pieces = [
    firstScreen ? `Starts on ${firstScreen.label}` : "",
    screenSummary,
    `${viewCount} views`,
    clickSummary,
    `Peak scroll ${scrollMax}%`,
    durationLabel,
    deviceLabel,
    locationLabel,
    sourceLabel,
    entryLabel ? `Entry ${entryLabel}` : "",
  ].filter(Boolean);

  return pieces.slice(0, 6).join(" | ");
}

function buildSessionModel(events, days) {
  const sessionMap = new Map();
  const pageViewVisitors = new Set();
  const pageViewSessions = new Set();
  const ctaImpressionSessions = new Set();
  const beginCheckoutSessions = new Set();
  const checkoutBlockedSessions = new Set();
  const deepScrollSessions = new Set();
  const engagedSessions = new Set();
  const carouselSessions = new Set();
  const linkClickSessions = new Set();
  const exitDurations = [];
  const daily = createCounterMap();
  const sourceMap = new Map();
  const countrySet = new Set();
  const deviceSet = new Set();
  const uniquePagePaths = new Set();
  let clickEventCount = 0;
  let scrollEventCount = 0;

  const sortedEvents = events
    .filter((entry) => {
      if (!entry || !TRACKED_EVENTS.has(entry.event)) return false;
      const props = entry.properties || {};
      return props.site_name === "mackley.co" || props.page_name || props.page_path;
    })
    .slice()
    .sort((left, right) => {
      const leftTime = toMillis(left.properties?.time || left.properties?.event_time || left.properties?.timestamp || left.time);
      const rightTime = toMillis(right.properties?.time || right.properties?.event_time || right.properties?.timestamp || right.time);
      return leftTime - rightTime;
    });

  sortedEvents.forEach((entry) => {
    const props = entry.properties || {};
    const sessionKey = getSessionKey(props);
    const visitorKey = getVisitorKey(props);
    const occurredAt = toMillis(props.time || props.event_time || props.timestamp || entry.time);
    const eventDay = dayKey(occurredAt);
    const source = normalizeSource(props);
    const eventSummary = buildEventSummary(entry);
    const pagePath = eventSummary.pagePath || normalizePagePath(props);
    const country = getProp(props, ["$country_name", "$country", "country", "geo_country"], "");
    const deviceSummary = buildDeviceSummary(normalizeDevice(props));

    if (!sessionMap.has(sessionKey)) {
      sessionMap.set(sessionKey, {
        key: sessionKey,
        sessionId: firstNonEmpty(props.session_id, props.distinct_id, ""),
        visitorId: firstNonEmpty(props.visitor_id, props.distinct_id, ""),
        visitorType: firstNonEmpty(props.visitor_type, ""),
        firstSeenAt: occurredAt,
        lastSeenAt: occurredAt,
        eventCount: 0,
        timeline: [],
        screenMap: new Map(),
        source: {
          first: null,
          last: null,
        },
        device: {
          browser: "",
          browserVersion: "",
          os: "",
          deviceType: "",
          viewportWidth: 0,
          viewportHeight: 0,
          screenWidth: 0,
          screenHeight: 0,
          language: "",
          timezone: "",
          touchPoints: 0,
          devicePixelRatio: 1,
          userAgent: "",
        },
        location: {
          city: "",
          region: "",
          country: "",
          countryCode: "",
          timezone: "",
          ip: "",
          summary: "Unknown",
        },
        entry: {
          landingPath: "",
          landingUrl: "",
          referrerDomain: "",
          referrerUrl: "",
          checkoutUrl: "",
        },
      });
    }

    const session = sessionMap.get(sessionKey);
    session.firstSeenAt = Math.min(session.firstSeenAt, occurredAt);
    session.lastSeenAt = Math.max(session.lastSeenAt, occurredAt);
    session.eventCount += 1;
    session.timeline.push(eventSummary);
    if (pagePath || eventSummary.pageTitle) {
      uniquePagePaths.add(pagePath || eventSummary.pageTitle);
    }

    if (!daily.has(eventDay)) {
      daily.set(eventDay, {
        pageViews: 0,
        ctaImpressions: 0,
        beginCheckout: 0,
        blocked: 0,
      });
    }

    const sourceEntry = sourceMap.get(source.key) || {
      label: source.key,
      source: source.source,
      medium: source.medium,
      campaign: source.campaign,
      pageViewSessions: new Set(),
      beginCheckoutSessions: new Set(),
    };
    sourceMap.set(source.key, sourceEntry);

    upsertSessionContext(session, props);
    upsertScreen(session, props, eventSummary);

    if (country) countrySet.add(country);
    if (deviceSummary) deviceSet.add(deviceSummary);

    switch (entry.event) {
      case "page_view":
        pageViewSessions.add(sessionKey);
        if (visitorKey) pageViewVisitors.add(visitorKey);
        daily.get(eventDay).pageViews += 1;
        sourceEntry.pageViewSessions.add(sessionKey);
        break;
      case "view_item":
        break;
      case "cta_impression":
        ctaImpressionSessions.add(sessionKey);
        daily.get(eventDay).ctaImpressions += 1;
        break;
      case "begin_checkout":
        beginCheckoutSessions.add(sessionKey);
        daily.get(eventDay).beginCheckout += 1;
        sourceEntry.beginCheckoutSessions.add(sessionKey);
        clickEventCount += 1;
        break;
      case "checkout_blocked":
        checkoutBlockedSessions.add(sessionKey);
        daily.get(eventDay).blocked += 1;
        clickEventCount += 1;
        break;
      case "scroll_depth":
        scrollEventCount += 1;
        if (toNumber(props.percent_scrolled) >= 50) {
          deepScrollSessions.add(sessionKey);
        }
        break;
      case "engagement_milestone":
        if (toNumber(props.milestone_seconds) >= 30) {
          engagedSessions.add(sessionKey);
        }
        break;
      case "carousel_interaction":
        carouselSessions.add(sessionKey);
        clickEventCount += 1;
        break;
      case "legal_click":
      case "link_click":
      case "entry_offer_goal_selected":
      case "entry_offer_email_submitted":
      case "entry_offer_phone_submitted":
      case "entry_offer_completed":
      case "entry_offer_closed":
        clickEventCount += 1;
        if (entry.event === "link_click" || entry.event === "legal_click") {
          linkClickSessions.add(sessionKey);
        }
        break;
      case "checkout_link_missing":
        break;
      case "entry_offer_viewed":
        break;
      case "page_exit":
        exitDurations.push(toNumber(props.engaged_time_seconds));
        break;
      default:
        break;
    }
  });

  const sessions = Array.from(sessionMap.values())
    .map((session) => summarizeSession(session))
    .sort((left, right) => right.lastSeenAt.localeCompare(left.lastSeenAt));

  const sources = Array.from(sourceMap.values())
    .map((entry) => {
      const pageViews = entry.pageViewSessions.size;
      const beginCheckout = entry.beginCheckoutSessions.size;
      return {
        label: entry.label,
        source: entry.source,
        medium: entry.medium,
        campaign: entry.campaign,
        pageViews,
        beginCheckout,
        checkoutRate: formatPercent(beginCheckout, pageViews),
      };
    })
    .sort((a, b) => b.pageViews - a.pageViews)
    .slice(0, 8);

  const timeline = Array.from(daily.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([date, values]) => ({
      date,
      pageViews: values.pageViews,
      ctaImpressions: values.ctaImpressions,
      beginCheckout: values.beginCheckout,
      blocked: values.blocked,
    }));

  const metrics = {
    days,
    totalEvents: sortedEvents.length,
    visitorCount: pageViewVisitors.size,
    pageViewSessions: pageViewSessions.size,
    ctaImpressionSessions: ctaImpressionSessions.size,
    beginCheckoutSessions: beginCheckoutSessions.size,
    checkoutBlockedSessions: checkoutBlockedSessions.size,
    deepScrollSessions: deepScrollSessions.size,
    engagedSessions: engagedSessions.size,
    carouselSessions: carouselSessions.size,
    linkClickSessions: linkClickSessions.size,
    uniquePagePaths: uniquePagePaths.size,
    countryCount: countrySet.size,
    deviceCount: deviceSet.size,
    clickEventCount,
    scrollEventCount,
    ctaImpressionRate: formatPercent(ctaImpressionSessions.size, pageViewSessions.size),
    checkoutRateOverall: formatPercent(beginCheckoutSessions.size, pageViewSessions.size),
    checkoutRateFromCta: formatPercent(beginCheckoutSessions.size, ctaImpressionSessions.size),
    deepScrollRate: formatPercent(deepScrollSessions.size, pageViewSessions.size),
    engagementRate: formatPercent(engagedSessions.size, pageViewSessions.size),
    carouselRate: formatPercent(carouselSessions.size, pageViewSessions.size),
    averageEngagedSeconds: exitDurations.length
      ? Number(
          (
            exitDurations.reduce((sum, value) => sum + value, 0) / exitDurations.length
          ).toFixed(1)
        )
      : 0,
  };

  const funnel = [
    {
      label: "Landing sessions",
      value: metrics.pageViewSessions,
      rate: 100,
    },
    {
      label: "CTA seen",
      value: metrics.ctaImpressionSessions,
      rate: metrics.ctaImpressionRate,
    },
    {
      label: "Checkout started",
      value: metrics.beginCheckoutSessions,
      rate: metrics.checkoutRateFromCta,
    },
    {
      label: "Checkout blocked",
      value: metrics.checkoutBlockedSessions,
      rate: formatPercent(metrics.checkoutBlockedSessions, metrics.pageViewSessions),
    },
  ];

  const recommendations = buildRecommendations(metrics, sources);

  return {
    ok: true,
    generatedAt: new Date().toISOString(),
    metrics,
    funnel,
    recommendations,
    timeline,
    sources,
    sessions,
  };
}

function buildRecommendations(metrics, sources) {
  const recommendations = [];

  if (metrics.checkoutBlockedSessions > 0) {
    recommendations.push({
      priority: "critical",
      title: "Fix checkout blockers immediately",
      detail:
        `${metrics.checkoutBlockedSessions} session(s) hit a blocked checkout. This is a hard revenue leak before optimization even starts.`,
      action: "Make sure the Stripe payment link is valid on production and confirm the redirect fires cleanly on mobile and desktop.",
    });
  }

  if (metrics.ctaImpressionRate < 75) {
    recommendations.push({
      priority: "high",
      title: "More visitors need to actually see the CTA",
      detail:
        `Only ${metrics.ctaImpressionRate}% of landing sessions reached a strong CTA impression. The buy button is not visible enough early in the visit.`,
      action: "Test a stickier or earlier CTA, reduce hero height, and tighten the copy above the button.",
    });
  }

  if (metrics.checkoutRateFromCta < 12 && metrics.ctaImpressionSessions >= 10) {
    recommendations.push({
      priority: "high",
      title: "Visitors see the CTA but do not trust the next step enough",
      detail:
        `Only ${metrics.checkoutRateFromCta}% of CTA-seeing sessions start checkout. The friction is likely offer clarity, trust, or pricing confidence.`,
      action: "Test trust signals near the CTA: shipping expectation, satisfaction language, material proof, and a cleaner buying promise.",
    });
  }

  if (metrics.deepScrollRate < 45) {
    recommendations.push({
      priority: "medium",
      title: "The story is losing people before the midpoint",
      detail: `Only ${metrics.deepScrollRate}% of sessions reached at least 50% scroll depth.`,
      action: "Front-load the strongest proof and product payoff. Treat the top half of the page as the real sales page.",
    });
  }

  const weakSource = sources.find(
    (source) => source.pageViews >= 5 && source.checkoutRate < metrics.checkoutRateOverall * 0.6
  );
  if (weakSource) {
    recommendations.push({
      priority: "medium",
      title: `Traffic from ${weakSource.label} is underperforming`,
      detail: `${weakSource.label} drives ${weakSource.pageViews} page views but only ${weakSource.checkoutRate}% begin checkout.`,
      action: "Align the ad or referral promise with the landing-page headline so the click intent matches the page immediately.",
    });
  }

  if (!recommendations.length) {
    recommendations.push({
      priority: "watch",
      title: "No severe leaks detected in the current sample",
      detail:
        "The current funnel looks directionally healthy. The next gains are likely from stronger creative and offer testing rather than fixing a single obvious break.",
      action: "Run one clear test at a time: headline, main image set, or CTA framing.",
    });
  }

  return recommendations.slice(0, 4);
}

function buildDashboardModel(events, days) {
  return buildSessionModel(events, days);
}

module.exports = {
  buildDashboardModel,
};
