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
  preview: {
    allowedHosts: [...previewAllowedHosts],
  },
});
