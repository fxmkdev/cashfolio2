import { defineConfig } from "vite";
export default defineConfig({
  publicDir: false,
  define: { __E2E_BUILD__: "false" },
  ssr: { target: "node", noExternal: true },
  build: {
    ssr: "src/securities-refresh/cli.server.ts",
    target: "node26",
    outDir: "dist/securities-refresh",
    rolldownOptions: { output: { entryFileNames: "refresh.mjs" } },
  },
});
