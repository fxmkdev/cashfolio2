import type { Preview } from "@storybook/react-vite";
import "../app/app.css";
import { createRoutesStub } from "react-router";
import { themes } from "storybook/theming";
import { Globals } from "storybook/internal/types";

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

    backgrounds: {
      options: {
        light: { name: "Light", value: "var(--color-neutral-100)" },
        dark: { name: "Dark", value: "var(--color-neutral-950)" },
      },
    },
  },
  initialGlobals: {
    backgrounds: { value: "light" },
  },
  decorators: [
    (Story) => {
      const Stub = createRoutesStub([
        {
          path: "*",
          Component: Story,
          loader: () => ({}),
        },
      ]);

      return <Stub initialEntries={["/"]} />;
    },
    (Story, { globals }) => (
      <div data-theme={getTheme(globals)} className="contents">
        <Story />
      </div>
    ),
  ],
  tags: ["autodocs"],
};

function getTheme(globals: Globals): "light" | "dark" {
  return globals.backgrounds?.value === "dark" ? "dark" : "light";
}

export default preview;

function getPreferredColorScheme() {
  if (!window || !window.matchMedia) return "light";

  const isDarkThemePreferred = window.matchMedia(
    "(prefers-color-scheme: dark)",
  ).matches;
  if (isDarkThemePreferred) return "dark";

  return "light";
}
