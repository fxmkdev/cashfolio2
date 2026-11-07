import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { AccountFilterHarness } from "./filter-harness";
import {
  assignmentCheckbox,
  selectAssignmentAccount,
} from "./interaction-helpers";

const meta: Meta<typeof AccountFilterHarness> = {
  title: "Routes/AccountsPageView/Filters",
  component: AccountFilterHarness,
};
export default meta;
type Story = StoryObj<typeof meta>;

function row(canvas: HTMLElement, id: string) {
  return canvas.querySelector(`.ag-row:not(.ag-opacity-zero)[row-id="${id}"]`);
}

async function checkbox(popup: HTMLElement, label: string) {
  if (!popup.isConnected)
    throw new Error(`Filter popup closed before selecting ${label}`);
  const text = await within(popup).findByText(label, { exact: true });
  const input = text
    .closest(".ag-set-filter-item")
    ?.querySelector<HTMLInputElement>('input[type="checkbox"]');
  if (!input) throw new Error(`Missing filter checkbox: ${label}`);
  await userEvent.click(input);
}

async function openHierarchy(canvasElement: HTMLElement) {
  await userEvent.click(
    within(canvasElement).getByRole("button", {
      name: "Open Hierarchy Filter",
    }),
  );
  let popup!: HTMLElement;
  await waitFor(() => {
    popup =
      canvasElement.ownerDocument.querySelector<HTMLElement>(".ag-filter")!;
    expect(popup).not.toBeNull();
  });
  await checkbox(popup, "(Select All)");
  await waitFor(() =>
    expect(
      canvasElement.querySelector(
        ".ag-center-cols-container .ag-row:not(.ag-opacity-zero)",
      ),
    ).toBeNull(),
  );
  return popup;
}

async function expandFilterNode(popup: HTMLElement, label: string) {
  const text = await within(popup).findByText(label, { exact: true });
  const icon = text
    .closest(".ag-set-filter-item")
    ?.querySelector(".ag-set-filter-group-closed-icon:not(.ag-hidden)");
  if (!icon) throw new Error(`Missing tree expansion: ${label}`);
  await userEvent.click(icon);
}

export const AssetClassBranchAndDirectAssignments: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const popup = await openHierarchy(canvasElement);
    await checkbox(popup, "Equities");
    await waitFor(() => {
      expect(row(canvasElement, "direct-usd")).not.toBeNull();
      expect(row(canvasElement, "child-chf")).not.toBeNull();
      expect(row(canvasElement, "archived-eur")).not.toBeNull();
      expect(row(canvasElement, "outside-usd")).toBeNull();
      expect(row(canvasElement, "unclassified-chf")).toBeNull();
    });
    await expandFilterNode(popup, "Equities");
    await checkbox(popup, "Listed Equities");
    await waitFor(() => {
      expect(row(canvasElement, "child-chf")).toBeNull();
      expect(row(canvasElement, "direct-usd")).not.toBeNull();
    });
    await expect(
      within(popup).getByText("Directly Assigned", { exact: true }),
    ).toBeVisible();
    await userEvent.keyboard("{Escape}");
    await userEvent.click(
      canvas.getByRole("button", { name: "Read Filter State" }),
    );
    await expect(canvas.getByTestId("filter-state")).toHaveTextContent(
      '"entity:EQUITIES"',
    );
    await userEvent.click(
      canvas.getByRole("button", { name: "Reclassify Child" }),
    );
    await userEvent.click(
      canvas.getByRole("button", { name: "Read Filter State" }),
    );
    await expect(canvas.getByTestId("filter-state")).toHaveTextContent(
      '"entity:EQUITIES"',
    );
    await expect(row(canvasElement, "child-chf")).toBeNull();
    await userEvent.click(
      canvas.getByRole("button", { name: "Clear Filters" }),
    );
    await waitFor(() => expect(row(canvasElement, "child-chf")).not.toBeNull());
    const refreshedPopup = await openHierarchy(canvasElement);
    await expect(
      within(refreshedPopup).getByText("Real Estate", { exact: true }),
    ).toBeVisible();
    await userEvent.type(
      within(refreshedPopup).getByRole("textbox"),
      "unclassified",
    );
    await checkbox(refreshedPopup, "Unclassified");
    await waitFor(() => {
      expect(row(canvasElement, "unclassified-chf")).not.toBeNull();
      expect(row(canvasElement, "direct-usd")).toBeNull();
      expect(row(canvasElement, "child-chf")).toBeNull();
    });
  },
};

export const MixedCurrencyAndBulkSelection: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      canvas.getByRole("button", { name: "Filter Mixed Methods" }),
    );
    await waitFor(() => {
      expect(row(canvasElement, "direct-usd")).not.toBeNull();
      expect(row(canvasElement, "child-chf")).not.toBeNull();
      expect(row(canvasElement, "outside-usd")).toBeNull();
    });
    await userEvent.click(
      canvas.getByRole("button", { name: "Filter Mixed USD" }),
    );
    await waitFor(() => {
      expect(row(canvasElement, "direct-usd")).not.toBeNull();
      expect(row(canvasElement, "child-chf")).toBeNull();
      expect(row(canvasElement, "outside-usd")).toBeNull();
    });
    await selectAssignmentAccount(canvasElement, "portfolio");
    await expect(await canvas.findByRole("status")).toHaveTextContent(
      "1 account selected",
    );
    await userEvent.click(
      canvas.getByRole("button", { name: "Clear Filters" }),
    );
    await waitFor(() => expect(row(canvasElement, "child-chf")).not.toBeNull());
    await expect(
      assignmentCheckbox(canvasElement, "child-chf"),
    ).not.toBeChecked();
    await userEvent.click(canvas.getByRole("button", { name: "Filter CHF" }));
    await waitFor(() => {
      expect(row(canvasElement, "child-chf")).not.toBeNull();
      expect(row(canvasElement, "unclassified-chf")).not.toBeNull();
      expect(row(canvasElement, "direct-usd")).toBeNull();
    });
    await expect(
      canvas.queryByRole("toolbar", { name: "Selected Account Actions" }),
    ).not.toBeInTheDocument();
  },
};

export const OriginalAccountGroupBranch: Story = {
  args: { grouping: "assetClass" },
  play: async ({ canvasElement }) => {
    const popup = await openHierarchy(canvasElement);
    await checkbox(popup, "Portfolio");
    await waitFor(() => {
      expect(row(canvasElement, "direct-usd")).not.toBeNull();
      expect(row(canvasElement, "child-chf")).not.toBeNull();
      expect(row(canvasElement, "archived-eur")).not.toBeNull();
      expect(row(canvasElement, "outside-usd")).toBeNull();
    });
    await expect(
      within(popup).getByText("Top Level", { exact: true }),
    ).toBeVisible();
    await expect(
      within(popup).queryByText("Empty", { exact: true }),
    ).toBeNull();
  },
};
