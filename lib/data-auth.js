const { createHmac, timingSafeEqual } = require("node:crypto");

const SESSION_COOKIE = "mackley_data_session";
const ONE_WEEK_SECONDS = 60 * 60 * 24 * 7;

function base64UrlEncode(value) {
  return Buffer.from(value, "utf8").toString("base64url");
}

function base64UrlDecode(value) {
  return Buffer.from(value, "base64url").toString("utf8");
}

function getPassword() {
  return String(process.env.DATA_DASHBOARD_PASSWORD || "BreatheDeeper");
}

function getSessionSecret() {
  return String(process.env.DATA_DASHBOARD_SESSION_SECRET || getPassword() || "");
}

function signPayload(payload) {
  return createHmac("sha256", getSessionSecret()).update(payload).digest("base64url");
}

function parseCookies(req) {
  const raw = req.headers.cookie || "";
  return raw.split(";").reduce((result, chunk) => {
    const [key, ...rest] = chunk.trim().split("=");
    if (!key) return result;
    result[key] = rest.join("=");
    return result;
  }, {});
}

function verifyPassword(input) {
  const expected = Buffer.from(getPassword());
  const actual = Buffer.from(String(input || ""));
  if (!expected.length || expected.length !== actual.length) return false;
  return timingSafeEqual(expected, actual);
}

function buildSessionValue() {
  const payload = base64UrlEncode(
    JSON.stringify({
      scope: "dashboard",
      exp: Date.now() + ONE_WEEK_SECONDS * 1000,
    })
  );
  return `${payload}.${signPayload(payload)}`;
}

function readSession(req) {
  const cookieValue = parseCookies(req)[SESSION_COOKIE];
  if (!cookieValue) return null;

  const [payload, signature] = cookieValue.split(".");
  if (!payload || !signature) return null;

  const expectedSignature = signPayload(payload);
  if (expectedSignature.length !== signature.length) return null;

  const expectedBuffer = Buffer.from(expectedSignature);
  const actualBuffer = Buffer.from(signature);
  if (!timingSafeEqual(expectedBuffer, actualBuffer)) return null;

  try {
    const decoded = JSON.parse(base64UrlDecode(payload));
    if (!decoded || decoded.scope !== "dashboard" || Number(decoded.exp) < Date.now()) {
      return null;
    }
    return decoded;
  } catch (error) {
    return null;
  }
}

function serializeSessionCookie() {
  const parts = [
    `${SESSION_COOKIE}=${buildSessionValue()}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Strict",
    `Max-Age=${ONE_WEEK_SECONDS}`,
  ];

  if (process.env.NODE_ENV !== "development") {
    parts.splice(3, 0, "Secure");
  }

  return parts.join("; ");
}

function serializeLogoutCookie() {
  const parts = [
    `${SESSION_COOKIE}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Strict",
    "Max-Age=0",
  ];

  if (process.env.NODE_ENV !== "development") {
    parts.splice(3, 0, "Secure");
  }

  return parts.join("; ");
}

function isAuthenticated(req) {
  return Boolean(readSession(req));
}

module.exports = {
  SESSION_COOKIE,
  getPassword,
  isAuthenticated,
  parseCookies,
  readSession,
  serializeLogoutCookie,
  serializeSessionCookie,
  verifyPassword,
};
