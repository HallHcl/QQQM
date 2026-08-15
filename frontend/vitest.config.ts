import path from "path"
import { defineConfig } from "vitest/config"
import react from "@vitejs/plugin-react"

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
    dedupe: ["react", "react-dom"],
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    // tests/ holds Playwright specs (separate runner, separate config) —
    // vitest's default include glob would otherwise pick them up and fail.
    exclude: ["node_modules/**", "tests/**"],
  },
})
