import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: { trace: "on-first-retry" },
  webServer: [
    {
      command: "bun run dev",
      url: "http://127.0.0.1:3000",
      reuseExistingServer: !process.env.CI,
    },
    {
      command: "bun run dev -- --port 3101",
      cwd: "./fixtures/next-app-router",
      url: "http://127.0.0.1:3101",
      reuseExistingServer: !process.env.CI,
    },
    {
      command: "bun run dev -- --port 5173 --host 127.0.0.1",
      cwd: "./fixtures/spa-vite",
      url: "http://127.0.0.1:5173",
      reuseExistingServer: !process.env.CI,
    },
  ],
  projects: [
    {
      name: "chrome",
      testMatch: "docs/**/*.spec.ts",
      use: {
        ...devices["Desktop Chrome"],
        baseURL: "http://127.0.0.1:3000",
        channel: "chrome",
      },
    },
    {
      name: "next-fixture",
      testMatch: "next-fixture/**/*.spec.ts",
      use: {
        ...devices["Desktop Chrome"],
        baseURL: "http://127.0.0.1:3101",
        channel: "chrome",
      },
    },
    {
      name: "spa-fixture",
      testMatch: "spa-fixture/**/*.spec.ts",
      use: {
        ...devices["Desktop Chrome"],
        baseURL: "http://127.0.0.1:5173",
        channel: "chrome",
      },
    },
  ],
});
