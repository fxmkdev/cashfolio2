import { relative } from "node:path";
import type { Plugin } from "vite";

/** Record the final server graph, after tree shaking, for artifact verification. */
export function buildSecurityManifest(e2eBuild: boolean): Plugin {
  return {
    name: "cashfolio-build-security-manifest",
    apply: "build",
    generateBundle(_options, bundle) {
      if (this.environment.name !== "nitro") return;
      const modules = new Set<string>();
      for (const output of Object.values(bundle)) {
        if (output.type !== "chunk") continue;
        for (const [id, info] of Object.entries(output.modules)) {
          if (info.renderedLength > 0)
            modules.add(relative(process.cwd(), id).replaceAll("\\", "/"));
        }
        for (const id of [...output.imports, ...output.dynamicImports])
          modules.add(id);
      }
      this.emitFile({
        type: "asset",
        fileName: "build-security.json",
        source: JSON.stringify({
          e2eBuild,
          modules: [...modules].sort(),
        }),
      });
    },
  };
}
