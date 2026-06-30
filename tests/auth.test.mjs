import assert from "node:assert/strict";
import test from "node:test";

import { authorizeOperator } from "../worker/src/auth.js";

test("legacy operator secrets are disabled by default", async () => {
  const request = new Request("https://api.mackley.co/ops/dashboard", {
    headers: { Authorization: "Bearer example-secret" }
  });
  const identity = await authorizeOperator(request, {
    DASHBOARD_SHARED_SECRET: "example-secret"
  }, ["owner"]);
  assert.equal(identity, null);
});

test("the migration flag explicitly enables a configured legacy secret", async () => {
  const request = new Request("https://api.mackley.co/ops/dashboard", {
    headers: { Authorization: "Bearer example-secret" }
  });
  const identity = await authorizeOperator(request, {
    ALLOW_LEGACY_ADMIN_SECRET: "true",
    DASHBOARD_SHARED_SECRET: "example-secret"
  }, ["owner"]);
  assert.equal(identity?.role, "owner");
  assert.equal(identity?.source, "legacy_secret");
});
