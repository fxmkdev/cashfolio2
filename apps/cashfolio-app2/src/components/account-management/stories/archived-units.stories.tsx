import {
  assetClassRowId,
  unitRowId,
  archivedClassRowId,
} from "../asset-class-tree";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { bulkRows } from "./assignment-fixtures";
import {
  selectAssignmentAccount,
  expandAssignmentGroup,
} from "./interaction-helpers";
import { AccountsPageStoryHarness } from "./harness";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { AccountsPageView } from "../page-view";

const meta: Meta<typeof AccountsPageView> = {
  title: "Routes/AccountsPageView",
  component: AccountsPageView,
};
export default meta;
type Story = StoryObj<typeof meta>;
export const AssetClassFullyArchivedUnits: Story = {
  beforeEach: () => {
    sessionStorage.removeItem("storybook:account-grouping:assetClass");
  },
  render: () => (
    <AccountsPageStoryHarness
      initialMode="active"
      initialGrouping="assetClass"
      bulkAssignment
      rememberExpansion
      rowsOverride={bulkRows.map((row) => ({
        ...row,
        ...(row.nodeType === "account" ? { assetClassId: "EQUITIES" } : {}),
        ...(row.id === "old"
          ? {
              unit: "SECURITY" as const,
              currency: null,
              symbol: "AEEM.PA",
              tradeCurrency: "EUR",
            }
          : {}),
      }))}
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const classId = assetClassRowId("EQUITIES");
    const archiveId = archivedClassRowId(classId);
    const unitId = unitRowId(classId, "SECURITY:AEEM.PA");
    const row = (id: string) =>
      canvasElement.querySelector<HTMLElement>(
        `.ag-row:not(.ag-opacity-zero)[row-id="${id}"]`,
      );
    await waitFor(() =>
      expect(row(archiveId)).toHaveAttribute("aria-expanded", "false"),
    );
    expect(
      row(archiveId)!.querySelector("[data-virtual-archived-label]"),
    ).toHaveTextContent("Archived");
    expect(row(unitId)).toBeNull();
    expect(row("old")).toBeNull();

    await expandAssignmentGroup(canvasElement, archiveId);
    await waitFor(() =>
      expect(row(unitId)).toHaveAttribute("aria-expanded", "false"),
    );
    expect(row("old")).toBeNull();
    await selectAssignmentAccount(canvasElement, archiveId);
    expect(await canvas.findByRole("status")).toHaveTextContent(
      "1 account selected",
    );
    await selectAssignmentAccount(canvasElement, archiveId);
    await expandAssignmentGroup(canvasElement, unitId);
    await waitFor(() => expect(row("old")).toHaveTextContent("Old Holding"));
    expect(row(archivedClassRowId(unitId))).toBeNull();
    await userEvent.click(row(unitId)!.querySelector(".ag-group-expanded")!);
    await waitFor(() => {
      expect(row(unitId)).toHaveAttribute("aria-expanded", "false");
      expect(row("old")).toBeNull();
    });
    await expandAssignmentGroup(canvasElement, unitId);
    await waitFor(() => expect(row("old")).toHaveTextContent("Old Holding"));
    for (const id of [archiveId, unitId])
      expect(
        row(id)!.querySelectorAll('[col-id="actions"] button'),
      ).toHaveLength(0);
  },
};
