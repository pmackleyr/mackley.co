const { getPassword, isAuthenticated } = require("../../lib/data-auth");
const { methodNotAllowed, sendJson } = require("../../lib/http");

function normalizeDays(value) {
  const next = Number(value);
  if ([7, 14, 30, 60, 90].includes(next)) return next;
  return 14;
}

module.exports = async (req, res) => {
  if (req.method !== "GET") {
    methodNotAllowed(res, ["GET"]);
    return;
  }

  if (!isAuthenticated(req)) {
    sendJson(res, 401, {
      ok: false,
      error: "unauthorized",
    });
    return;
  }

  const days = normalizeDays(req.query?.days);

  try {
    const response = await fetch("https://api.mackley.co/analytics/dashboard", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.DASHBOARD_SHARED_SECRET || getPassword()}`,
      },
      body: JSON.stringify({ days }),
    });

    const payload = await response.json().catch(() => ({}));
    res.setHeader("Cache-Control", "no-store");
    sendJson(res, response.status, payload);
  } catch (error) {
    sendJson(res, 500, {
      ok: false,
      error: "dashboard_query_failed",
      detail: error.message,
    });
  }
};
