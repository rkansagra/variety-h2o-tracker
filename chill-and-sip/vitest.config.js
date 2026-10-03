import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// Separate from vite.config.js (rather than adding a `test` block there) so the PWA plugin
// and its build-only service-worker generation never run under Vitest.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.js"],
    css: false,
  },
});
