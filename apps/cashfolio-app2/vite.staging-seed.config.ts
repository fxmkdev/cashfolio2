import { defineConfig } from "vite";

// Keep the release payload independent of the application and its runtime.
export default defineConfig({
  publicDir: false,
  ssr: { target: "node", noExternal: true },
  build: {
    ssr: "src/staging-seed/cli.ts",
    target: "node24",
    outDir: "dist/staging-seed",
    rolldownOptions: {
      output: { entryFileNames: "seed.mjs" },
    },
  },
});
