import { defineConfig } from "vite";

export default defineConfig({
  publicDir: false,
  ssr: { target: "node", noExternal: true },
  build: {
    ssr: "src/provider-usage-cleanup/cli.ts",
    target: "node26",
    outDir: "dist/provider-usage-cleanup",
    rolldownOptions: {
      output: { entryFileNames: "cleanup.mjs" },
    },
  },
});
