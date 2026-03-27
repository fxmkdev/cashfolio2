import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";

const previewAllowedHosts = new Set<string>([
  "localhost",
  "127.0.0.1",
  ".fly.dev",
]);

const canonicalHostname = process.env.CANONICAL_HOSTNAME?.trim();
if (canonicalHostname) {
  previewAllowedHosts.add(canonicalHostname);
}

const baseUrl = process.env.BASE_URL?.trim();
if (baseUrl) {
  try {
    previewAllowedHosts.add(new URL(baseUrl).hostname);
  } catch {
    // Ignore invalid BASE_URL values.
  }
}

export default defineConfig({
  plugins: [tanstackStart()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (
            id.includes("ag-grid-enterprise") ||
            id.includes("ag-grid-react")
          ) {
            return "ag-grid";
          }
          if (
            id.includes("ag-charts-community") ||
            id.includes("ag-charts-react")
          ) {
            return "ag-charts";
          }
        },
      },
    },
  },
  preview: {
    allowedHosts: [...previewAllowedHosts],
  },
});
