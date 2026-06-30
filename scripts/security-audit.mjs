import { readFile } from "node:fs/promises";

const checks = [
  ["worker/src/index.js", /BreatheDeeper/, "Worker contains a fallback dashboard password"],
  ["lib/data-auth.js", /BreatheDeeper/, "Legacy API contains a fallback dashboard password"],
  ["dashboard/dashboard.js", /PASSWORD_STORAGE_KEY|sessionStorage.*password/i, "Dashboard stores a shared password"],
  ["spray-intake.js", /localStorage\.setItem\(intakeStorageKey/, "Intake persists medical data in local storage"]
];

let failed = false;
for (const [path, pattern, message] of checks) {
  const source = await readFile(new URL(`../${path}`, import.meta.url), "utf8");
  if (pattern.test(source)) {
    failed = true;
    console.error(`FAIL ${path}: ${message}`);
  } else {
    console.log(`PASS ${path}`);
  }
}

if (failed) process.exitCode = 1;
