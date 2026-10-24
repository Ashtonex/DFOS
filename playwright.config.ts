import { defineConfig, devices } from "@playwright/test";

// Browser checks run against the production server (`next start`).
// Every test gets a fresh browser context, so its IndexedDB is isolated
// from the presenter's own browser profile.
export default defineConfig({
  testDir: "./e2e",
  timeout: 90_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"], ["json", { outputFile: "test-results/e2e-results.json" }]],
  use: {
    baseURL: "http://localhost:3100",
    trace: "retain-on-failure",
    ...devices["Desktop Chrome"],
  },
  webServer: {
    command: "npx next start -p 3100",
    url: "http://localhost:3100/operations",
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
