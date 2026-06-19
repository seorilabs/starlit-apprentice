import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: "http://127.0.0.1:5317",
    trace: "retain-on-failure"
  },
  webServer: {
    command: "pnpm --filter @starlit-apprentice/app dev -- --host 127.0.0.1 --port 5317 --strictPort",
    url: "http://127.0.0.1:5317",
    reuseExistingServer: true,
    timeout: 120_000
  },
  projects: [
    {
      name: "mobile-390",
      use: {
        ...devices["Pixel 5"],
        viewport: { width: 390, height: 844 }
      }
    },
    {
      name: "mobile-360",
      use: {
        ...devices["Pixel 5"],
        viewport: { width: 360, height: 740 }
      }
    }
  ]
});
