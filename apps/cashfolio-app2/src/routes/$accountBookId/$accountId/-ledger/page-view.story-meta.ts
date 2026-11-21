import type { Meta } from "@storybook/react-vite";
import { LedgerPageView } from "./page-view";

export const ledgerPageStoryMeta = {
  parameters: { layout: "fullscreen", controls: { disable: true } },
  component: LedgerPageView,
} satisfies Meta<typeof LedgerPageView>;
