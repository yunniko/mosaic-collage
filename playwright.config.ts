import { defineConfig, devices } from "@playwright/test";

/**
 * The e2e suite runs against the static export: the same files production serves. With `E2E_EXTERNAL=1` it uses a
 * server already listening on the port instead (CI runs the production nginx image there).
 */
const PORT = 4317;
const viewport = { width: 1440, height: 900 };

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["line"], ["html", { open: "never" }]] : [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    viewport,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "chromium", testIgnore: /touch\.spec\.ts$/, use: { ...devices["Desktop Chrome"], viewport } },
    { name: "firefox", testIgnore: /touch\.spec\.ts$/, use: { ...devices["Desktop Firefox"], viewport } },
    {
      name: "tablet",
      testMatch: /touch\.spec\.ts$/,
      use: { ...devices["Desktop Chrome"], viewport: { width: 1194, height: 834 }, hasTouch: true },
    },
  ],
  webServer: process.env.E2E_EXTERNAL
    ? undefined
    : {
        command: `npx serve out -l ${PORT} --no-clipboard`,
        url: `http://localhost:${PORT}`,
        reuseExistingServer: !process.env.CI,
        timeout: 60_000,
      },
});
