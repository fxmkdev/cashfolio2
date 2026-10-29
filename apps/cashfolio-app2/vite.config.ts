import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import { nitro } from "nitro/vite";
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
  plugins: [
    tanstackStart(),
    nitro({
      // Keep MSW's parser WASM beside its interceptor modules at runtime.
      traceDeps: ["@mswjs/interceptors*"],
    }),
  ],
  build: {
    rolldownOptions: {
      onLog(level, log, defaultHandler) {
        // Dependencies ship RSC markers; this app uses SSR without RSC.
        if (
          level === "warn" &&
          log.code === "MODULE_LEVEL_DIRECTIVE" &&
          log.message.includes("use client")
        ) {
          return;
        }
        defaultHandler(level, log);
      },
    },
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  preview: {
    allowedHosts: [...previewAllowedHosts],
  },
});
