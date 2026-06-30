import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  testMatch: "ui.spec.mjs",
  fullyParallel: false,
  retries: 0,
  reporter: "line",
  use: {
    baseURL: "http://127.0.0.1:8011",
    browserName: "chromium",
    screenshot: "only-on-failure",
    trace: "retain-on-failure"
  },
  webServer: {
    command: "python3 -m http.server 8011 --bind 127.0.0.1",
    url: "http://127.0.0.1:8011/dashboard/",
    reuseExistingServer: true,
    timeout: 10_000
  }
});
