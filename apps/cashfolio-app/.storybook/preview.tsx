import type { Preview } from "@storybook/react-vite";
import "../app/app.css";
import { themes } from "storybook/theming";
import { MantineProvider } from "@mantine/core";
import { theme } from "../app/theme";
import "../app/mantine";
import {
  ModuleRegistry as GridModuleRegistry,
  AllEnterpriseModule as GridAllEnterpriseModule,
} from "ag-grid-enterprise";

const preview: Preview = {
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    docs: {
      // Docs theme does not adapt to system theme out-of-the-box
      // see https://github.com/storybookjs/storybook/issues/28664#issuecomment-2241393451
      theme: themes[getPreferredColorScheme()],
    },
  },
  decorators: [
    (Story) => {
      return (
        <div data-ag-theme-mode={getPreferredColorScheme()}>
          <MantineProvider theme={theme} defaultColorScheme="auto">
            <Story />
          </MantineProvider>
        </div>
      );
    },
  ],
};

GridModuleRegistry.registerModules([GridAllEnterpriseModule]);

export default preview;

function getPreferredColorScheme() {
  if (!window || !window.matchMedia) return "light";

  const isDarkThemePreferred = window.matchMedia(
    "(prefers-color-scheme: dark)",
  ).matches;
  if (isDarkThemePreferred) return "dark";

  return "light";
}
