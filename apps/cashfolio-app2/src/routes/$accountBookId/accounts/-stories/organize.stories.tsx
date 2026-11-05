import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { AccountsPageView } from "../-page-view";
import { AccountsPageStoryHarness } from "./harness";
import { createOrganizerStoryApi } from "../-organize/story-fixtures";

const meta: Meta<typeof AccountsPageView> = {
  title: "Routes/AccountsPageView",
  component: AccountsPageView,
};
export default meta;
type Story = StoryObj<typeof meta>;

export const OrganizeEntryAndExit: Story = {
  render: () => (
    <AccountsPageStoryHarness initialMode="active" organize bulkAssignment />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const organizeTop = canvas
      .getByRole("button", { name: "Organize" })
      .getBoundingClientRect().top;
    await userEvent.click(canvas.getByRole("button", { name: "Organize" }));
    await expect(
      await canvas.findByRole("region", { name: "Organize Accounts" }),
    ).toBeVisible();
    await expect(canvas.getByText("Organizing", { exact: true })).toBeVisible();
    await expect(
      canvas.getByRole("button", { name: "Done" }).getBoundingClientRect().top,
    ).toBeCloseTo(organizeTop, 0);
    await expect(
      canvas.queryByRole("toolbar", { name: "Organize Account Actions" }),
    ).not.toBeInTheDocument();
    await expect(
      canvas.queryByRole("button", { name: "Add Account" }),
    ).not.toBeInTheDocument();
    await expect(
      canvas.queryByRole("button", { name: "Set Asset Class" }),
    ).not.toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: "Done" }));
    await expect(
      canvas.queryByRole("region", { name: "Organize Accounts" }),
    ).not.toBeInTheDocument();
    await expect(
      canvas.getByRole("button", { name: "Add Account" }),
    ).toBeVisible();
  },
};

function deferredEntryScenario(failFirst: boolean): NonNullable<Story["play"]> {
  return async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const financialGrid = await canvas.findByRole("treegrid");
    const original = args.organizerApi!.load;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const load = fn(async () => {
      await gate;
      return original();
    });
    args.organizerApi!.load = load;
    try {
      await expect(load).not.toHaveBeenCalled();
      await userEvent.click(canvas.getByRole("button", { name: "Organize" }));
      await expect(financialGrid).toBeVisible();
      await expect(
        canvas.queryByRole("region", { name: "Organize Accounts" }),
      ).not.toBeInTheDocument();
      await expect(
        canvas.getByRole("button", { name: "Organize" }),
      ).toBeDisabled();
      await expect(
        canvasElement.querySelector(".mantine-Loader-root"),
      ).toBeNull();
      release();
      if (failFirst) {
        await expect(await canvas.findByRole("alert")).toHaveTextContent(
          "Could not load",
        );
        await expect(financialGrid).toBeVisible();
        await userEvent.click(
          canvas.getByRole("button", { name: "Try Again" }),
        );
      }
      await expect(
        await canvas.findByRole("region", { name: "Organize Accounts" }),
      ).toBeVisible();
      await expect(load).toHaveBeenCalledTimes(failFirst ? 2 : 1);
      await expect(financialGrid).not.toBeVisible();
      await userEvent.click(canvas.getByRole("button", { name: "Done" }));
      await expect(canvas.getByRole("treegrid")).toBe(financialGrid);
      await expect(financialGrid).toBeVisible();
    } finally {
      release();
      args.organizerApi!.load = original;
    }
  };
}

export const DeferredOrganizeEntry: Story = {
  args: { organizerApi: createOrganizerStoryApi() },
  render: (args) => (
    <AccountsPageStoryHarness
      initialMode="active"
      organizerApi={args.organizerApi}
    />
  ),
  play: deferredEntryScenario(false),
};

export const OrganizeEntryFailureAndRetry: Story = {
  args: { organizerApi: createOrganizerStoryApi("load") },
  render: (args) => (
    <AccountsPageStoryHarness
      initialMode="active"
      organizerApi={args.organizerApi}
    />
  ),
  play: deferredEntryScenario(true),
};

export const OrganizeFromAssetClassGrouping: Story = {
  render: () => (
    <AccountsPageStoryHarness
      initialMode="active"
      initialGrouping="assetClass"
      organize
      bulkAssignment
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const financialGrid = await canvas.findByRole("treegrid");
    await expect(canvas.getByLabelText("Group By")).toHaveValue("Asset Class");
    await userEvent.click(canvas.getByRole("button", { name: "Organize" }));
    const organizer = within(
      await canvas.findByRole("region", { name: "Organize Accounts" }),
    );
    await expect(
      await organizer.findByText("Investments", { exact: true }),
    ).toBeVisible();
    await expect(canvas.queryByLabelText("Group By")).not.toBeInTheDocument();
    await expect(financialGrid).not.toBeVisible();
    await waitFor(() =>
      expect(canvas.getByRole("button", { name: "Done" })).toBeEnabled(),
    );
    await userEvent.click(canvas.getByRole("button", { name: "Done" }));
    await expect(canvas.getByRole("treegrid")).toBe(financialGrid);
    await expect(financialGrid).toBeVisible();
    await expect(canvas.getByLabelText("Group By")).toHaveValue("Asset Class");
    await expect(
      canvas.getByRole("link", { name: "Manage Asset Classes" }),
    ).toBeVisible();
  },
};
