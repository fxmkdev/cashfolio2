import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, within } from "storybook/test";
import { LinkAnchor } from "./link-anchor";

const meta = {
  title: "Components/LinkAnchor",
  component: LinkAnchor,
  args: {
    children: "Open account book",
    to: "/$accountBookId",
    params: { accountBookId: "storybook-book" } as never,
    search: { tab: "ASSET", mode: "active" } as never,
  },
} satisfies Meta<typeof LinkAnchor>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const RendersHref: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const link = canvas.getByRole("link", { name: "Open account book" });
    await expect(link).toHaveAttribute(
      "href",
      expect.stringContaining("/storybook-book"),
    );
  },
};
