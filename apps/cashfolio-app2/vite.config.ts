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

export default defineConfig(({ mode }) => ({
  define: { __E2E_BUILD__: JSON.stringify(mode === "e2e") },
  plugins: [
    tanstackStart(),
    nitro({
      // MSW 3 needs its parser WASM only in the isolated E2E artifact.
      ...(mode === "e2e" ? { traceDeps: ["@mswjs/interceptors*"] } : {}),
      output: { dir: mode === "e2e" ? ".output-e2e" : ".output" },
      plugins: [
        fileURLToPath(
          new URL(
            "./src/security/runtime-configuration-plugin.server.ts",
            import.meta.url,
          ),
        ),
        ...(mode === "e2e"
          ? [
              fileURLToPath(
                new URL("./src/e2e/provider-plugin.server.ts", import.meta.url),
              ),
            ]
          : []),
      ],
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
}));
