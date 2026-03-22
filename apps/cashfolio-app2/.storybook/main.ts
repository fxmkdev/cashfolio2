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
    };
  },
};

export default config;
