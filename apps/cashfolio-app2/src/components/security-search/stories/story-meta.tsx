import { Box } from "@mantine/core";
import type { Decorator, Meta } from "@storybook/react-vite";
import { SecuritySearchHarness } from "./harness";
import { ControllerHarness } from "./controller-harness";

const screenDecorator: Decorator = (Story) => (
  <Box h="100dvh" style={{ display: "flex", flexDirection: "column" }}>
    <Story />
  </Box>
);

export const securitySearchStoryMeta = {
  title: "Screens/Securities",
  component: SecuritySearchHarness,
  decorators: [screenDecorator],
  parameters: {
    layout: "fullscreen",
    controls: { disable: true },
    docs: {
      description: {
        component: `Securities page presentation with a fixture-backed server-side datasource. All listings, symbol/exchange combinations and prices are illustrative local fixtures, not live Marketstack data or verified coverage.

Open **Screens / Securities / Default**. Select Search with an empty query to browse all sample listings, or enter a name/symbol and optionally choose an exchange. Changes apply only on Search or Enter. Select a grid row (click, or focus a cell and press Space) to open the persistent right-side details pane. On mobile, details replace the results; Back to Results preserves the grid state. Grid pages retain selection; a submitted search resets selection and pagination. Columns are informational and have no sorting or filters. Explore price ranges and Copy Symbol.

These stories use deterministic local data and never call the backend or Marketstack. Loading/error stories are fixed scenarios; Retry Search and Retry Price History recover locally. Clipboard feedback is simulated in the copy-specific stories. Other stories use the browser clipboard.

Viewing stories wait for manual interaction. Clear the regression exclusion in the sidebar tag filter to reveal automated Interaction Test stories. Selected Listing pins the light theme, Dark Theme pins dark, and Swiss Locale uses de-CH independently of the toolbar. Mobile examples pin the shared mobile viewport.

Run locally with Node 26: pnpm --filter cashfolio-app2 storybook.`,
      },
    },
  },
} satisfies Meta<typeof SecuritySearchHarness>;

export const controllerStoryMeta = {
  title: "Screens/Securities",
  component: ControllerHarness,
  decorators: [screenDecorator],
  parameters: {
    layout: "fullscreen",
    controls: { disable: true },
    docs: {
      description: {
        component:
          "The production controller and server-side grid run against deterministic local service doubles. No Marketstack or backend calls are made.",
      },
    },
  },
} satisfies Meta<typeof ControllerHarness>;
