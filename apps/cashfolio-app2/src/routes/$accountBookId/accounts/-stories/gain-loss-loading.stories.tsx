import { expect, userEvent, waitFor, within } from "storybook/test";
import { findVisibleDialog, openGainLossDetails } from "./interaction-helpers";
import { AccountsPageStoryHarness } from "./harness";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { AccountsPageView } from "../-page-view";
const meta: Meta<typeof AccountsPageView> = {
  title: "Routes/AccountsPageView",
  component: AccountsPageView,
};
export default meta;
type Story = StoryObj<typeof meta>;
export const GainLossLoading: Story = {
  render: () => (
    <AccountsPageStoryHarness initialMode="active" gainLossState="loading" />
  ),
  play: async ({ canvasElement }) => {
    const details = await openGainLossDetails(canvasElement);
    expect(details).toHaveTextContent("Loading calculation dates…");
    expect(details).toHaveTextContent(
      "Totals include active and archived accounts",
    );
    await userEvent.keyboard("{Escape}");
  },
};

export const GainLossLoadingToReady: Story = {
  render: () => (
    <AccountsPageStoryHarness
      initialMode="active"
      gainLossState="loading"
      toggleGainLossLoading
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    let header = await canvas.findByRole("columnheader", {
      name: /G\/L Since Start \(CHF\)/,
    });
    await within(canvas.getByRole("treegrid")).findByText("Assets", {
      exact: true,
    });
    const grid = canvasElement.querySelector(".ag-root-wrapper");
    const firstRow = canvasElement.querySelector('.ag-row[row-index="0"]');
    if (!grid || !firstRow) throw new Error("Accounts grid has no first row");
    expect(grid.getBoundingClientRect().height).toBeGreaterThan(100);
    const gridTop = grid.getBoundingClientRect().top;
    const rowTop = firstRow.getBoundingClientRect().top;
    const headerBounds = header.getBoundingClientRect();
    expect(header).not.toHaveTextContent(/2026|Loading|unavailable/);
    await userEvent.click(
      canvas.getByRole("button", { name: "Toggle gain/loss loading" }),
    );
    await waitFor(() =>
      expect(
        firstRow.querySelector('[col-id="totalGainLoss"]'),
      ).toHaveTextContent("10.00"),
    );
    header = canvas.getByRole("columnheader", {
      name: /G\/L Since Start \(CHF\)/,
    });
    expect(grid.getBoundingClientRect().top).toBe(gridTop);
    expect(firstRow.getBoundingClientRect().top).toBe(rowTop);
    expect(header.getBoundingClientRect().top).toBe(headerBounds.top);
    expect(header.getBoundingClientRect().height).toBe(headerBounds.height);
    expect(header).not.toHaveTextContent(/2026|Loading|unavailable/);

    header.focus();
    await userEvent.tab();
    const button = canvas.getByRole("button", {
      name: "Show Gain/Loss Details",
    });
    expect(button).toHaveFocus();
    await userEvent.keyboard("{Enter}");
    const details = await within(canvasElement.ownerDocument.body).findByRole(
      "dialog",
      { name: "Gain/Loss Details" },
    );
    expect(details).toHaveTextContent("Since 1/1/2026 · As of 3/31/2026");
    expect(details).toHaveTextContent("Incomplete columns show —");
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(details).not.toBeVisible());
    expect(button).toHaveFocus();
    await userEvent.tab({ shift: true });
    expect(header).toHaveFocus();
    await userEvent.tab();
    await userEvent.tab();
    expect(button).not.toHaveFocus();

    await userEvent.click(
      canvas.getByRole("button", { name: "Toggle gain/loss loading" }),
    );
    const loadingDetails = await openGainLossDetails(canvasElement);
    header = canvas.getByRole("columnheader", {
      name: /G\/L Since Start \(CHF\)/,
    });
    expect(loadingDetails).toHaveTextContent("Loading calculation dates…");
    expect(loadingDetails).not.toHaveTextContent("Since 1/1/2026");
    expect(grid.getBoundingClientRect().top).toBe(gridTop);
    expect(firstRow.getBoundingClientRect().top).toBe(rowTop);
    expect(header.getBoundingClientRect().top).toBe(headerBounds.top);
    expect(header.getBoundingClientRect().height).toBe(headerBounds.height);
    await userEvent.keyboard("{Escape}");
  },
};

export const GainLossCompletesWithDetailsOpen: Story = {
  render: () => (
    <AccountsPageStoryHarness
      initialMode="active"
      gainLossState="loading"
      toggleGainLossLoading
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    const header = await canvas.findByRole("columnheader", {
      name: /G\/L Since Start \(CHF\)/,
    });
    header.focus();
    await userEvent.tab();
    await userEvent.keyboard("{Enter}");
    const details = await findVisibleDialog(body, "Gain/Loss Details");
    expect(details).toHaveTextContent("Loading calculation dates…");
    await waitFor(() =>
      expect(details.contains(canvasElement.ownerDocument.activeElement)).toBe(
        true,
      ),
    );

    // Resolve the simulated request without an outside pointer event or focus change.
    const toggleLoading = canvas.getByRole("button", {
      name: "Toggle gain/loss loading",
    });
    toggleLoading.click();
    await waitFor(() =>
      expect(
        canvasElement.querySelector(
          '.ag-row[row-index="0"] [col-id="totalGainLoss"]',
        ),
      ).toHaveTextContent("10.00"),
    );
    await waitFor(() =>
      expect(details).toHaveTextContent("Since 1/1/2026 · As of 3/31/2026"),
    );
    expect(details.isConnected).toBe(true);
    expect(body.getByRole("dialog", { name: "Gain/Loss Details" })).toBe(
      details,
    );
    expect(details.contains(canvasElement.ownerDocument.activeElement)).toBe(
      true,
    );

    toggleLoading.click();
    await waitFor(() =>
      expect(
        canvasElement.querySelector(
          '.ag-row[row-index="0"] [col-id="totalGainLoss"] .mantine-Loader-root',
        ),
      ).toBeVisible(),
    );
    await waitFor(() =>
      expect(details).toHaveTextContent("Loading calculation dates…"),
    );
    expect(details).not.toHaveTextContent("Since 1/1/2026");
    expect(details.contains(canvasElement.ownerDocument.activeElement)).toBe(
      true,
    );
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(details).not.toBeVisible());
    expect(
      canvas.getByRole("button", { name: "Show Gain/Loss Details" }),
    ).toHaveFocus();
  },
};
