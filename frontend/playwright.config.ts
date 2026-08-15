import { defineConfig, devices } from "@playwright/test";

/**
 * Scoped to manual/local visual sweeps against the Vite dev server — NOT
 * the Docker production build, which strips dev warnings that matter for
 * verification. Assumes `npm run dev` (frontend) and the backend + db are
 * already running; this config does not manage those processes.
 */
export default defineConfig({
  testDir: "./tests",
  timeout: 30_000,
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:5173",
    trace: "off",
    screenshot: "off",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
