import { defineConfig, devices } from "@playwright/test";

const dashboardPort = 4173;

export default defineConfig({
  testDir: "./apps/dashboard/e2e",
  outputDir: ".tmp/playwright-results",
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: "list",
  expect: {
    timeout: 5_000,
    toHaveScreenshot: {
      animations: "disabled",
      caret: "hide",
      maxDiffPixelRatio: 0.005,
      threshold: 0.2
    }
  },
  use: {
    ...devices["Desktop Chrome"],
    baseURL: `http://127.0.0.1:${dashboardPort}`,
    colorScheme: "dark",
    locale: "en-US",
    timezoneId: "UTC",
    screenshot: "off",
    trace: "off",
    video: "off"
  },
  projects: [
    {
      name: "chromium",
      use: { browserName: "chromium" }
    }
  ],
  webServer: {
    command: `pnpm --filter @axi/dashboard exec vite --host 127.0.0.1 --port ${dashboardPort} --strictPort`,
    url: `http://127.0.0.1:${dashboardPort}/?ui=v2`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      VITE_AXI_API_URL: "http://127.0.0.1:4399"
    }
  }
});
