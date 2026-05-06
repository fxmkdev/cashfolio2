import type { StorybookConfig } from "@storybook/react-vite";

const TANSTACK_START_PLUGIN_PATTERN =
  /tanstack-(react-)?start|react-start|start-core/i;

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
          "#tanstack-start-entry": new URL(
            "./tanstack-start-entry.stub.ts",
            import.meta.url,
          ).pathname,
          "#tanstack-router-entry": new URL(
            "./tanstack-router-entry.stub.ts",
            import.meta.url,
          ).pathname,
          "#tanstack-start-plugin-adapters": new URL(
            "./tanstack-start-plugin-adapters.stub.ts",
            import.meta.url,
          ).pathname,
          "#tanstack-start-server-fn-resolver": new URL(
            "./tanstack-start-server-fn-resolver.stub.ts",
            import.meta.url,
          ).pathname,
          "tanstack-start-manifest:v": new URL(
            "./tanstack-start-manifest.stub.ts",
            import.meta.url,
          ).pathname,
          "tanstack-start-injected-head-scripts:v": new URL(
            "./tanstack-start-injected-head-scripts.stub.ts",
            import.meta.url,
          ).pathname,
          "@tanstack/start-storage-context": new URL(
            "./tanstack-start-storage-context.stub.ts",
            import.meta.url,
          ).pathname,
        },
      },
    };
  },
};

export default config;
