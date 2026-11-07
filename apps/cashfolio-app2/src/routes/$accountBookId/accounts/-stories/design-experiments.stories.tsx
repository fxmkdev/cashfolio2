import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { AccountsPageStoryHarness } from "./harness";
import { ControlsRowAccountsLayout } from "./controls-row-layout";
import {
  chooseAccountGrouping,
  findVisibleDialog,
  selectAssignmentAccount,
} from "./interaction-helpers";

const meta = {
  title: "Design Experiments/Accounts",
  component: AccountsPageStoryHarness,
  parameters: {
    layout: "fullscreen",
    router: { initialPath: "/storybook-book/accounts?tab=BALANCE&mode=active" },
  },
  args: {
    initialMode: "active",
    expandGroups: true,
    organize: true,
    bulkAssignment: true,
    withShell: true,
    showDebugControls: false,
    // Enable diagnostics so the clean-preview assertions also cover their suppression.
    routeSmoke: true,
  },
} satisfies Meta<typeof AccountsPageStoryHarness>;

export default meta;
type Story = StoryObj<typeof meta>;

const exerciseLayout: NonNullable<Story["play"]> = async ({
  canvasElement,
}) => {
  const canvas = within(canvasElement);
  const body = within(canvasElement.ownerDocument.body);
  await expect(canvas.getByRole("heading", { name: "Accounts" })).toBeVisible();
  await expect(
    canvas.getByRole("link", { name: "Transactions" }),
  ).toBeVisible();
  await expect(
    canvas.getByRole("button", { name: "Collapse Sidebar" }),
  ).toBeVisible();
  const grid = await canvas.findByRole("treegrid");
  await expect(grid).toBeVisible();
  await waitFor(() =>
    expect(grid.getBoundingClientRect().height).toBeGreaterThan(200),
  );
  await expect(grid.getBoundingClientRect().bottom).toBeLessThanOrEqual(
    window.innerHeight,
  );
  await expect(
    canvas.queryByRole("button", { name: "Filter to Checking" }),
  ).not.toBeInTheDocument();
  await expect(canvas.queryByTestId("router-path")).not.toBeInTheDocument();
  await expect(canvas.queryByTestId("router-search")).not.toBeInTheDocument();

  await chooseAccountGrouping(canvasElement, "Asset Class");
  await expect(
    canvas.getByRole("link", { name: "Manage Asset Classes" }),
  ).toBeVisible();
  await chooseAccountGrouping(canvasElement, "Account Structure");
  await expect(canvas.getByRole("treegrid")).toBe(grid);

  await userEvent.click(canvas.getByRole("button", { name: "Add Account" }));
  const dialogElement = await findVisibleDialog(body, "New Account");
  const dialog = within(dialogElement);
  await userEvent.type(
    dialog.getByRole("textbox", { name: /^Name/ }),
    "Design Preview Account",
  );
  await userEvent.click(dialog.getByRole("combobox", { name: "Currency" }));
  await userEvent.click(await body.findByRole("option", { name: /CHF/ }));
  await userEvent.click(dialog.getByRole("button", { name: "Create" }));
  await waitFor(() => expect(dialogElement).not.toBeInTheDocument());

  await selectAssignmentAccount(canvasElement, "account-checking");
  await userEvent.click(canvas.getByRole("button", { name: "Organize" }));
  await expect(
    await canvas.findByRole("region", { name: "Organize Accounts" }),
  ).toBeVisible();
  await expect(grid).not.toBeVisible();
  await userEvent.click(canvas.getByRole("button", { name: "Done" }));
  await waitFor(() => expect(canvas.getByRole("treegrid")).toBeVisible());
  await expect(canvas.getByRole("treegrid")).toBe(grid);
  await expect(
    canvas.queryByRole("toolbar", { name: "Selected Account Actions" }),
  ).not.toBeInTheDocument();
};

export const BaselineScreen: Story = { play: exerciseLayout };

export const ControlsRowScreen: Story = {
  args: { View: ControlsRowAccountsLayout },
  play: exerciseLayout,
};
