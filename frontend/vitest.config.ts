/// <reference types="vitest" />
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

/**
 * Vitest config — jsdom env for component tests, React plugin for JSX.
 *
 * Test files live alongside source as `*.test.tsx` / `*.test.ts`.
 * Run with `npm test`. Coverage with `npm run test:coverage`.
 */
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./"),
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
    css: false, // we don't render CSS in unit tests
    include: ["components/**/*.test.{ts,tsx}", "lib/**/*.test.{ts,tsx}"],
  },
});
