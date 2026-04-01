const API_BASE = process.env.MACKLEY_API_BASE || "https://api.mackley.co";

function usage() {
  console.error("Usage: node scripts/social-proof-count.mjs <metric> [hours]");
  process.exit(1);
}

function padNumber(value) {
  return String(value).padStart(2, "0");
}

function normalizeMetricKey(value) {
  if (typeof value !== "string") return "";
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

function hourStamp(date) {
  return `${date.getUTCFullYear()}${padNumber(date.getUTCMonth() + 1)}${padNumber(date.getUTCDate())}${padNumber(date.getUTCHours())}`;
}

async function fetchBucketCount(metric, stamp) {
  const response = await fetch(`${API_BASE}/social-proof`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      type: "view",
      page: `${metric}-${stamp}`,
      record: false,
      total: true
    })
  });

  if (!response.ok) {
    throw new Error(`Metric query failed for ${metric}-${stamp}: ${response.status}`);
  }

  const data = await response.json();
  return typeof data.count === "number" ? data.count : 0;
}

const metric = normalizeMetricKey(process.argv[2] || "");
const hours = Number(process.argv[3] || 72);

if (!metric || !Number.isInteger(hours) || hours < 1 || hours > 168) {
  usage();
}

const now = new Date();
now.setUTCMinutes(0, 0, 0);

const buckets = [];
for (let offset = 0; offset < hours; offset += 1) {
  const bucketTime = new Date(now.getTime() - offset * 60 * 60 * 1000);
  const stamp = hourStamp(bucketTime);
  const count = await fetchBucketCount(metric, stamp);
  buckets.push({
    bucket: stamp,
    count
  });
}

const activeBuckets = buckets.filter((entry) => entry.count > 0).reverse();
const total = buckets.reduce((sum, entry) => sum + entry.count, 0);

console.log(JSON.stringify({
  metric,
  hours,
  total,
  activeBuckets
}, null, 2));
