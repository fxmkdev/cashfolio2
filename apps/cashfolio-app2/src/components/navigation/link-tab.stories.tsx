import type { Meta, StoryObj } from "@storybook/react-vite";
import { Tabs } from "@mantine/core";
import { expect, within } from "storybook/test";
import { LinkTab } from "./link-tab";

function LinkTabStory({ selectedTab }: { selectedTab: "BALANCE" }) {
  return (
    <Tabs value={selectedTab}>
      <Tabs.List>
        <LinkTab
          value="BALANCE"
          to="/$accountBookId/accounts"
          params={{ accountBookId: "storybook-book" }}
          search={{ tab: "BALANCE", mode: "active" }}
        >
          Asset
        </LinkTab>
        <LinkTab
          value="BALANCE"
          to="/$accountBookId/accounts"
          params={{ accountBookId: "storybook-book" }}
          search={{ tab: "BALANCE", mode: "active" }}
        >
          Liability
        </LinkTab>
      </Tabs.List>
    </Tabs>
  );
}

const meta = {
  title: "Components/LinkTab",
  component: LinkTabStory,
  args: {
    selectedTab: "BALANCE",
  },
} satisfies Meta<typeof LinkTabStory>;

export default meta;

type Story = StoryObj<typeof meta>;

export const SelectedAsset: Story = {};

export const SelectedLiability: Story = {
  args: {
    selectedTab: "BALANCE",
  },
};

export const RendersHref: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const assetTabLink = canvas.getByRole("tab", { name: "Asset" });

    await expect(assetTabLink).toHaveAttribute(
      "href",
      expect.stringContaining("/storybook-book/accounts"),
    );
  },
};
