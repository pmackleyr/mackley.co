const jwksCache = new Map();
const JWKS_TTL_MS = 60 * 60 * 1000;

function base64UrlBytes(value) {
  const normalized = String(value || "").replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function decodeJwtPart(value) {
  return JSON.parse(new TextDecoder().decode(base64UrlBytes(value)));
}

function normalizeTeamDomain(value) {
  return String(value || "")
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/\/+$/, "");
}

function parseList(value) {
  return new Set(
    String(value || "")
      .split(",")
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean)
  );
}

function resolveRole(email, env) {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  if (!normalizedEmail) return null;
  if (parseList(env.OPS_OWNER_EMAILS).has(normalizedEmail)) return "owner";
  if (parseList(env.OPS_PROVIDER_EMAILS).has(normalizedEmail)) return "provider";
  if (parseList(env.OPS_ANALYST_EMAILS).has(normalizedEmail)) return "analyst";
  if (parseList(env.OPS_SUPPORT_EMAILS).has(normalizedEmail)) return "support";
  return null;
}

function readAccessToken(request) {
  const header = request.headers.get("Cf-Access-Jwt-Assertion");
  if (header) return header.trim();
  const cookie = request.headers.get("Cookie") || "";
  const match = cookie.match(/(?:^|;\s*)CF_Authorization=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : "";
}

async function getJwks(teamDomain) {
  const cached = jwksCache.get(teamDomain);
  if (cached && cached.expiresAt > Date.now()) return cached.keys;
  const response = await fetch(`https://${teamDomain}/cdn-cgi/access/certs`, {
    cf: { cacheTtl: 3600, cacheEverything: true }
  });
  if (!response.ok) throw new Error("access_jwks_unavailable");
  const payload = await response.json();
  const keys = Array.isArray(payload.keys) ? payload.keys : [];
  jwksCache.set(teamDomain, { keys, expiresAt: Date.now() + JWKS_TTL_MS });
  return keys;
}

function hasExpectedAudience(actual, expected) {
  const values = Array.isArray(actual) ? actual : [actual];
  return values.includes(expected);
}

export async function verifyAccessIdentity(request, env) {
  const token = readAccessToken(request);
  const teamDomain = normalizeTeamDomain(env.CF_ACCESS_TEAM_DOMAIN);
  const expectedAudience = String(env.CF_ACCESS_AUD || "").trim();
  if (!token || !teamDomain || !expectedAudience) return null;

  const parts = token.split(".");
  if (parts.length !== 3) return null;
  let header;
  let claims;
  try {
    header = decodeJwtPart(parts[0]);
    claims = decodeJwtPart(parts[1]);
  } catch (error) {
    return null;
  }
  if (header.alg !== "RS256" || !header.kid) return null;

  const now = Math.floor(Date.now() / 1000);
  const issuer = `https://${teamDomain}`;
  if (claims.iss !== issuer
    || !hasExpectedAudience(claims.aud, expectedAudience)
    || !Number.isFinite(claims.exp)
    || claims.exp <= now
    || (Number.isFinite(claims.nbf) && claims.nbf > now + 30)) {
    return null;
  }

  const jwks = await getJwks(teamDomain);
  const jwk = jwks.find((candidate) => candidate.kid === header.kid);
  if (!jwk) return null;
  const key = await crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"]
  );
  const valid = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    key,
    base64UrlBytes(parts[2]),
    new TextEncoder().encode(`${parts[0]}.${parts[1]}`)
  );
  if (!valid) return null;

  const email = String(claims.email || "").trim().toLowerCase();
  const role = resolveRole(email, env);
  if (!role) return null;
  return { sub: String(claims.sub || email), email, role, source: "cloudflare_access" };
}

function readBearerSecret(request) {
  const header = request.headers.get("Authorization")
    || request.headers.get("X-Dashboard-Secret")
    || request.headers.get("X-Referral-Secret")
    || "";
  return header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : header.trim();
}

function constantTimeEqual(left, right) {
  const a = new TextEncoder().encode(String(left || ""));
  const b = new TextEncoder().encode(String(right || ""));
  const length = Math.max(a.length, b.length);
  let mismatch = a.length ^ b.length;
  for (let index = 0; index < length; index += 1) {
    mismatch |= (a[index] || 0) ^ (b[index] || 0);
  }
  return mismatch === 0;
}

function verifyLegacySecret(request, env, secretNames) {
  if (String(env.ALLOW_LEGACY_ADMIN_SECRET || "").toLowerCase() !== "true") return false;
  const provided = readBearerSecret(request);
  return secretNames.some((name) => {
    const expected = String(env[name] || "").trim();
    return Boolean(expected && provided && constantTimeEqual(provided, expected));
  });
}

export async function authorizeOperator(request, env, allowedRoles, options = {}) {
  try {
    const identity = await verifyAccessIdentity(request, env);
    if (identity && allowedRoles.includes(identity.role)) return identity;
  } catch (error) {
    // Authentication failures are intentionally indistinguishable to callers.
  }

  const legacySecretNames = options.legacySecretNames || ["DASHBOARD_SHARED_SECRET"];
  if (verifyLegacySecret(request, env, legacySecretNames)) {
    return { sub: "legacy-admin", email: "", role: "owner", source: "legacy_secret" };
  }
  return null;
}
