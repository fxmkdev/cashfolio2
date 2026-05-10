import { fileURLToPath } from "node:url";
import type { StorybookConfig } from "@storybook/react-vite";

const TANSTACK_START_PLUGIN_PATTERN =
  /tanstack-(react-)?start|react-start|start-core/i;

function toFilePath(relativePath: string) {
  return fileURLToPath(new URL(relativePath, import.meta.url));
}

const config: StorybookConfig = {
  core: {
    builder: {
      name: "@storybook/builder-vite",
      options: {
        viteConfigPath: ".storybook/vite.config.ts",
      },
    },
  },
  stories: ["../src/**/*.stories.@(js|jsx|mjs|ts|tsx)", "../docs/**/*.mdx"],
  addons: ["@storybook/addon-docs"],
  framework: {
    name: "@storybook/react-vite",
    options: {},
  },
  typescript: {
    reactDocgen: "react-docgen-typescript",
  },
  async viteFinal(viteConfig) {
    const filteredPlugins = (viteConfig.plugins ?? []).filter((plugin) => {
      if (!plugin || typeof plugin !== "object" || !("name" in plugin)) {
        return true;
      }

      const name = String(plugin.name ?? "");
      return !TANSTACK_START_PLUGIN_PATTERN.test(name);
    });

    return {
      ...viteConfig,
      plugins: filteredPlugins,
      resolve: {
        ...(viteConfig.resolve ?? {}),
        alias: {
          ...(viteConfig.resolve?.alias ?? {}),
          "#tanstack-start-entry": toFilePath("./tanstack-start-entry.stub.ts"),
          "#tanstack-router-entry": toFilePath(
            "./tanstack-router-entry.stub.ts",
          ),
          "#tanstack-start-plugin-adapters": toFilePath(
            "./tanstack-start-plugin-adapters.stub.ts",
          ),
          "#tanstack-start-server-fn-resolver": toFilePath(
            "./tanstack-start-server-fn-resolver.stub.ts",
          ),
          "tanstack-start-manifest:v": toFilePath(
            "./tanstack-start-manifest.stub.ts",
          ),
          "tanstack-start-injected-head-scripts:v": toFilePath(
            "./tanstack-start-injected-head-scripts.stub.ts",
          ),
          "@tanstack/start-storage-context": toFilePath(
            "./tanstack-start-storage-context.stub.ts",
          ),
        },
      },
    };
  },
};

export default config;
