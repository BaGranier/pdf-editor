import { defineConfig, devices } from "@playwright/test";
import path from "node:path";

const frontendUrl = process.env.QA_BASE_URL ?? "http://127.0.0.1:5173";
const backendUrl = process.env.QA_BACKEND_URL ?? "http://127.0.0.1:8000";
const shouldStartServers = process.env.QA_SKIP_WEBSERVERS !== "1";
const uvCacheDirectory = path.resolve(process.cwd(), "../../.uv-cache");
const configuredWorkers = Number(process.env.QA_WORKERS ?? "1");

export default defineConfig({
  testDir: "./e2e/specs",
  outputDir: "./test-results/artifacts",
  snapshotPathTemplate: "{testDir}/../snapshots/{projectName}/{testFilePath}/{arg}{ext}",
  timeout: 60_000,
  expect: {
    timeout: 15_000,
    toHaveScreenshot: {
      animations: "disabled",
      caret: "hide",
      maxDiffPixelRatio: 0.02,
    },
  },
  fullyParallel: true,
  workers:
    Number.isInteger(configuredWorkers) && configuredWorkers > 0
      ? configuredWorkers
      : 1,
  retries: process.env.CI ? 1 : 0,
  forbidOnly: Boolean(process.env.CI),
  reporter: [
    ["line"],
    ["html", { outputFolder: "test-results/playwright-report", open: "never" }],
    ["json", { outputFile: "test-results/results.json" }],
    ["./e2e/helpers/artifact-reporter.ts"],
  ],
  use: {
    baseURL: frontendUrl,
    acceptDownloads: true,
    screenshot: "only-on-failure",
    trace: "on-first-retry",
    video: "retain-on-failure",
    viewport: { width: 1440, height: 960 },
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "firefox",
      use: { ...devices["Desktop Firefox"] },
    },
  ],
  webServer: shouldStartServers
    ? [
        {
          command:
            "uv run --directory ../../services/pdf-engine uvicorn app.main:app --host 127.0.0.1 --port 8000",
          url: `${backendUrl}/health`,
          timeout: 120_000,
          reuseExistingServer: !process.env.CI,
          env: { UV_CACHE_DIR: uvCacheDirectory },
          stdout: "pipe",
          stderr: "pipe",
        },
        {
          command: `npm run dev -- --host 127.0.0.1 --port 5173`,
          url: frontendUrl,
          timeout: 120_000,
          reuseExistingServer: !process.env.CI,
          env: {
            VITE_PDF_ENGINE_URL: backendUrl,
          },
          stdout: "pipe",
          stderr: "pipe",
        },
      ]
    : undefined,
});
