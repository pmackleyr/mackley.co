const {
  getPassword,
  serializeSessionCookie,
  verifyPassword,
} = require("../../lib/data-auth");
const { methodNotAllowed, readJsonBody, sendJson } = require("../../lib/http");

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    methodNotAllowed(res, ["POST"]);
    return;
  }

  if (!getPassword()) {
    sendJson(res, 500, {
      ok: false,
      error: "dashboard_password_not_configured",
    });
    return;
  }

  try {
    const body = await readJsonBody(req);
    const password = String(body.password || "");

    if (!verifyPassword(password)) {
      sendJson(res, 401, {
        ok: false,
        error: "invalid_password",
      });
      return;
    }

    res.setHeader("Set-Cookie", serializeSessionCookie());
    sendJson(res, 200, {
      ok: true,
    });
  } catch (error) {
    sendJson(res, 400, {
      ok: false,
      error: "invalid_request_body",
    });
  }
};
