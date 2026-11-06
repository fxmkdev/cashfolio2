import { expect, fn, userEvent, within } from "storybook/test";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { AccountsPageView } from "../-page-view";
import { AccountsPageStoryHarness } from "./harness";
import { createOrganizerStoryApi } from "../-organize/story-fixtures";
import { chooseAccountGrouping } from "./interaction-helpers";

const meta: Meta<typeof AccountsPageView> = {
  title: "Routes/AccountsPageView",
  component: AccountsPageView,
  parameters: {
    router: { initialPath: "/storybook-book/accounts?tab=BALANCE&mode=active" },
  },
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

export const OrganizeOnlyForAccountStructure: Story = {
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
    await expect(
      canvas.queryByRole("button", { name: "Organize" }),
    ).not.toBeInTheDocument();
    await expect(
      canvas.getByRole("link", { name: "Manage Asset Classes" }),
    ).toBeVisible();
    await chooseAccountGrouping(canvasElement, "Account Structure");
    await expect(
      canvas.getByRole("button", { name: "Organize" }),
    ).toBeVisible();
    await expect(
      canvas.getByRole("button", { name: "Add Group" }),
    ).toBeVisible();
    await chooseAccountGrouping(canvasElement, "Asset Class");
    await expect(
      canvas.queryByRole("button", { name: "Organize" }),
    ).not.toBeInTheDocument();
    await expect(canvas.getByRole("treegrid")).toBe(financialGrid);
    await expect(financialGrid).toBeVisible();
  },
};

export const GroupingChangeCancelsOrganizeEntry: Story = {
  args: { organizerApi: createOrganizerStoryApi() },
  render: (args) => (
    <AccountsPageStoryHarness
      initialMode="active"
      organizerApi={args.organizerApi}
    />
  ),
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const financialGrid = await canvas.findByRole("treegrid");
    const original = args.organizerApi!.load;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const load = fn(original).mockImplementationOnce(async () => {
      await gate;
      return original();
    });
    args.organizerApi!.load = load;
    try {
      await userEvent.click(canvas.getByRole("button", { name: "Organize" }));
      await expect(
        canvas.getByRole("button", { name: "Organize" }),
      ).toBeDisabled();
      await chooseAccountGrouping(canvasElement, "Asset Class");
      await expect(
        canvas.queryByRole("button", { name: "Organize" }),
      ).not.toBeInTheDocument();
      await expect(financialGrid).toBeVisible();
      await chooseAccountGrouping(canvasElement, "Account Structure");
      await expect(
        canvas.getByRole("button", { name: "Organize" }),
      ).toBeEnabled();
      release();
      await load.mock.results[0]!.value;
      await userEvent.hover(canvas.getByRole("heading", { name: "Accounts" }));
      await expect(
        canvas.queryByRole("region", { name: "Organize Accounts" }),
      ).not.toBeInTheDocument();
      await expect(canvas.getByRole("treegrid")).toBe(financialGrid);
      await expect(financialGrid).toBeVisible();
      await expect(load).toHaveBeenCalledTimes(1);
      await userEvent.click(canvas.getByRole("button", { name: "Organize" }));
      await expect(
        await canvas.findByRole("region", { name: "Organize Accounts" }),
      ).toBeVisible();
      await expect(load).toHaveBeenCalledTimes(2);
      await userEvent.click(canvas.getByRole("button", { name: "Done" }));
    } finally {
      release();
      args.organizerApi!.load = original;
    }
  },
};
