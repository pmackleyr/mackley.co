const { serializeLogoutCookie } = require("../../lib/data-auth");
const { methodNotAllowed, sendJson } = require("../../lib/http");

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    methodNotAllowed(res, ["POST"]);
    return;
  }

  res.setHeader("Set-Cookie", serializeLogoutCookie());
  sendJson(res, 200, {
    ok: true,
  });
};
