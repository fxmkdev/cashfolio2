import { expect, fn, userEvent, within } from "storybook/test";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { AccountsPageView } from "../view";
import { AccountsPageStoryHarness } from "./harness";
import { createOrganizerStoryApi } from "@/components/hierarchy-organize/story-fixtures";
import { chooseAccountGrouping } from "./interaction-helpers";

const meta: Meta<typeof AccountsPageView> = {
  title: "Screens/Accounts/Organize/Entry/Overview",
  component: AccountsPageView,
  parameters: {
    layout: "fullscreen",
    controls: { disable: true },
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
    const initialBounds = {
      mode: canvas
        .getByRole("button", { name: "Organize" })
        .getBoundingClientRect(),
      group: canvas
        .getByRole("button", { name: "Add Group" })
        .getBoundingClientRect(),
      account: canvas
        .getByRole("button", { name: "Add Account" })
        .getBoundingClientRect(),
    };
    const expectStationaryActions = async (mode: "Organize" | "Done") => {
      for (const [name, before] of [
        [mode, initialBounds.mode],
        ["Add Group", initialBounds.group],
        ["Add Account", initialBounds.account],
      ] as const) {
        const after = canvas
          .getByRole("button", { name })
          .getBoundingClientRect();
        for (const dimension of ["left", "top", "width"] as const)
          await expect(after[dimension]).toBeCloseTo(before[dimension], 0);
      }
    };
    await userEvent.click(canvas.getByRole("button", { name: "Organize" }));
    await expect(
      await canvas.findByRole("region", { name: "Organize Accounts" }),
    ).toBeVisible();
    await expect(canvas.getByText("Organizing", { exact: true })).toBeVisible();
    await expectStationaryActions("Done");
    canvas.getByRole("button", { name: "Done" }).focus();
    await userEvent.tab();
    await expect(
      canvas.getByRole("button", { name: "Add Group" }),
    ).toHaveFocus();
    await userEvent.tab();
    await expect(
      canvas.getByRole("button", { name: "Add Account" }),
    ).toHaveFocus();
    await expect(
      canvas.queryByRole("toolbar", { name: "Organize Account Actions" }),
    ).not.toBeInTheDocument();
    await expect(
      canvas.getByRole("button", { name: "Add Account" }),
    ).toBeVisible();
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
    await expectStationaryActions("Organize");
  },
  name: "Organize Entry And Exit Interaction Test",
  tags: ["regression", "!autodocs"],
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

export const Default: Story = {
  args: { organizerApi: createOrganizerStoryApi() },
  render: (args) => (
    <AccountsPageStoryHarness
      initialMode="active"
      organizerApi={args.organizerApi}
    />
  ),
  name: "Default",
  tags: ["!regression"],
  play: undefined,
};

export const DeferredOrganizeEntry: Story = {
  ...Default,
  name: "Deferred Organize Entry Interaction Test",
  tags: ["regression", "!autodocs"],
  play: deferredEntryScenario(false),
};

export const OrganizeEntryFailureAndRetryView: Story = {
  args: { organizerApi: createOrganizerStoryApi("load") },
  render: (args) => (
    <AccountsPageStoryHarness
      initialMode="active"
      organizerApi={args.organizerApi}
    />
  ),
  name: "Organize Entry Failure And Retry Playground",
  tags: ["!regression"],
  play: undefined,
};

export const OrganizeEntryFailureAndRetry: Story = {
  ...OrganizeEntryFailureAndRetryView,
  name: "Organize Entry Failure And Retry Interaction Test",
  tags: ["regression", "!autodocs"],
  play: deferredEntryScenario(true),
};

export const OrganizeOnlyForAccountStructureView: Story = {
  render: () => (
    <AccountsPageStoryHarness
      initialMode="active"
      initialGrouping="assetClass"
      organize
      bulkAssignment
    />
  ),
  name: "Organize Only For Account Structure Playground",
  tags: ["!regression"],
  play: undefined,
};

export const OrganizeOnlyForAccountStructure: Story = {
  ...OrganizeOnlyForAccountStructureView,
  name: "Organize Only For Account Structure Interaction Test",
  tags: ["regression", "!autodocs"],
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
  name: "Grouping Change Cancels Organize Entry Interaction Test",
  tags: ["regression", "!autodocs"],
};
