import {
  assetClassRowId,
  unitRowId,
  archivedClassRowId,
} from "../-asset-class-tree";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { REFERENCE_CURRENCY_TOTAL_FOOTER_ROW_ID } from "../-page-types";
import { bulkRows } from "./assignment-fixtures";
import {
  findVisibleDialog,
  chooseAccountGrouping,
  selectAssignmentAccount,
  expandAssignmentGroup,
} from "./interaction-helpers";
import { AccountsPageStoryHarness } from "./harness";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { AccountsPageView } from "../-page-view";
const meta: Meta<typeof AccountsPageView> = {
  title: "Routes/AccountsPageView",
  component: AccountsPageView,
};
export default meta;
type Story = StoryObj<typeof meta>;
export const AssetClassSwitchingAndExpansion: Story = {
  beforeEach: () => {
    sessionStorage.removeItem("storybook:account-grouping:accountStructure");
    sessionStorage.removeItem("storybook:account-grouping:assetClass");
  },
  render: () => (
    <AccountsPageStoryHarness
      initialMode="active"
      bulkAssignment
      rememberExpansion
      rowsOverride={bulkRows.map((row) =>
        row.nodeType === "account" ? { ...row, assetClassId: "EQUITIES" } : row,
      )}
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const classId = assetClassRowId("EQUITIES");
    const unitId = unitRowId(classId, "CURRENCY:CHF");
    const checkingName = () =>
      canvasElement.querySelector<HTMLElement>(
        '.ag-row:not(.ag-opacity-zero)[row-id="account-checking"] [col-id="ag-Grid-AutoColumn"]',
      );
    await waitFor(() => {
      const name = checkingName();
      if (!name) throw new Error("Initial Checking row is missing");
      expect(name).toBeVisible();
    });
    const standardRowHeight = checkingName()!
      .closest<HTMLElement>(".ag-row")!
      .getBoundingClientRect().height;
    await expect(
      canvas.getByRole("columnheader", { name: /^Asset Class$/ }),
    ).toBeVisible();
    const collapse = async (id: string) => {
      await waitFor(() =>
        expect(
          canvasElement.querySelector(".ag-row.ag-opacity-zero"),
        ).toBeNull(),
      );
      const selector = `.ag-row:not(.ag-opacity-zero)[row-id="${id}"] .ag-group-expanded`;
      await waitFor(() =>
        expect(canvasElement.querySelector(selector)).not.toBeNull(),
      );
      await userEvent.click(canvasElement.querySelector(selector)!);
      await waitFor(() =>
        expect(
          canvasElement.querySelector(
            `.ag-row:not(.ag-opacity-zero)[row-id="${id}"]`,
          ),
        ).toHaveAttribute("aria-expanded", "false"),
      );
    };
    await collapse("portfolio");
    await chooseAccountGrouping(canvasElement, "Asset Class");
    await waitFor(() =>
      expect(
        canvasElement.querySelector(`[row-id="${unitId}"]`),
      ).toHaveAttribute("aria-expanded", "false"),
    );
    await expect(checkingName()).toBeNull();
    await expandAssignmentGroup(canvasElement, unitId);
    await expect(
      canvas.getByRole("link", { name: "Manage Asset Classes" }),
    ).toHaveAttribute("href", "/storybook-book/settings/classifications");
    await expect(
      canvas.queryByRole("button", { name: "Add Group" }),
    ).not.toBeInTheDocument();
    await waitFor(() =>
      expect(
        canvasElement.querySelector(
          '[row-id="account-checking"] [col-id="path"]',
        ),
      ).toHaveTextContent("Portfolio"),
    );
    await expect(checkingName()).toHaveTextContent(/^Checking$/);
    await expect(
      canvas.getByRole("columnheader", { name: /^Path$/ }),
    ).toBeVisible();
    await expect(
      canvas.queryByRole("columnheader", { name: /^Asset Class$/ }),
    ).not.toBeInTheDocument();
    await waitFor(() =>
      expect(
        checkingName()!.closest<HTMLElement>(".ag-row")!.getBoundingClientRect()
          .height,
      ).toBe(standardRowHeight),
    );
    await expect(
      canvasElement.querySelectorAll(
        `[row-id="${classId}"] [col-id="actions"] button`,
      ),
    ).toHaveLength(0);
    await expect(canvasElement.querySelector('[row-id="old"]')).toBeNull();
    await expandAssignmentGroup(canvasElement, archivedClassRowId(unitId));
    await waitFor(() =>
      expect(canvasElement.querySelector('[row-id="old"]')).not.toBeNull(),
    );
    for (const id of ["account-checking", "old"]) {
      await expect(
        canvasElement
          .querySelector<HTMLElement>(`[row-id="${id}"]`)!
          .getBoundingClientRect().height,
      ).toBe(standardRowHeight);
      await waitFor(() => {
        const actions = canvasElement.querySelector<HTMLElement>(
          `.ag-row:not(.ag-opacity-zero)[row-id="${id}"] [col-id="actions"]`,
        );
        if (!actions) throw new Error(`Missing actions for ${id}`);
        expect(
          within(actions).getByRole("button", { name: "Reorder Siblings" }),
        ).toBeDisabled();
        expect(
          within(actions).getByRole("button", { name: "Edit" }),
        ).toBeEnabled();
      });
    }
    await collapse(classId);
    await chooseAccountGrouping(canvasElement, "Account Structure");
    await waitFor(() =>
      expect(
        canvasElement.querySelector(
          '[row-id="portfolio"] .ag-group-contracted',
        ),
      ).not.toBeNull(),
    );
    await expandAssignmentGroup(canvasElement, "portfolio");
    await waitFor(() => {
      const name = checkingName();
      if (!name)
        throw new Error("Checking row is missing after reopening Portfolio");
      expect(name).toBeVisible();
    });
    await expect(checkingName()).toHaveTextContent(/^Checking$/);
    await expect(
      checkingName()!.closest<HTMLElement>(".ag-row")!.getBoundingClientRect()
        .height,
    ).toBe(standardRowHeight);
    await expect(
      canvas.getByRole("columnheader", { name: /^Asset Class$/ }),
    ).toBeVisible();
    await expect(
      canvas.queryByRole("columnheader", { name: /^Path$/ }),
    ).not.toBeInTheDocument();
    await chooseAccountGrouping(canvasElement, "Asset Class");
    await waitFor(() =>
      expect(
        canvasElement.querySelector(
          `[row-id="${classId}"] .ag-group-contracted`,
        ),
      ).not.toBeNull(),
    );
    await expandAssignmentGroup(canvasElement, classId);
    await waitFor(() =>
      expect(
        canvasElement.querySelector(`[row-id="${unitId}"]`),
      ).toHaveAttribute("aria-expanded", "true"),
    );
    await selectAssignmentAccount(canvasElement, unitId);
    await expect(await canvas.findByRole("status")).toHaveTextContent(
      "2 accounts selected",
    );
    await chooseAccountGrouping(canvasElement, "Account Structure");
    await waitFor(() =>
      expect(
        canvas.queryByRole("toolbar", { name: "Selected Account Actions" }),
      ).not.toBeInTheDocument(),
    );
  },
};

export const AssetClassFilteredBulkAssignment: Story = {
  render: () => (
    <AccountsPageStoryHarness
      initialMode="active"
      initialGrouping="assetClass"
      bulkAssignment
      expandGroups
      rowsOverride={bulkRows.map((row) =>
        row.nodeType === "account" ? { ...row, assetClassId: "EQUITIES" } : row,
      )}
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      canvas.getByRole("button", { name: "Filter to Checking" }),
    );
    await selectAssignmentAccount(
      canvasElement,
      unitRowId(assetClassRowId("EQUITIES"), "CURRENCY:CHF"),
    );
    await expect(await canvas.findByRole("status")).toHaveTextContent(
      "1 account selected",
    );
    await userEvent.click(
      canvas.getByRole("button", { name: "Set Asset Class" }),
    );
    const dialog = within(await findVisibleDialog(body, "Set Asset Class"));
    await userEvent.click(dialog.getByLabelText("Asset Class"));
    await userEvent.click(body.getByRole("option", { name: "Fixed Income" }));
    await userEvent.click(dialog.getByRole("button", { name: "Apply" }));
    await waitFor(() =>
      expect(canvas.getByTestId("assignment-account-ids")).toHaveTextContent(
        /^account-checking$/,
      ),
    );
    await userEvent.click(
      canvas.getByRole("button", { name: "Clear Account Filters" }),
    );
    await waitFor(() =>
      expect(
        canvasElement.querySelector(
          '[row-id="account-checking"] [col-id="path"]',
        ),
      ).toHaveTextContent("Portfolio"),
    );
    await expect(
      canvasElement.querySelector(
        `[row-id="${assetClassRowId("FIXED_INCOME")}"]`,
      ),
    ).not.toBeNull();
    await expect(
      canvasElement.querySelector(`[row-id="${assetClassRowId("EQUITIES")}"]`),
    ).not.toBeNull();
    await expect(
      canvas.queryByRole("toolbar", { name: "Selected Account Actions" }),
    ).not.toBeInTheDocument();
  },
};

export const AssetClassTrackingMethodRegrouping: Story = {
  render: () => (
    <AccountsPageStoryHarness
      initialMode="active"
      initialGrouping="assetClass"
      bulkAssignment
      expandGroups
      rowsOverride={bulkRows.map((row) =>
        row.nodeType === "account" ? { ...row, assetClassId: "EQUITIES" } : row,
      )}
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    const classId = assetClassRowId("EQUITIES");
    const managedId = unitRowId(classId, "managed-portfolios");
    const balance = (id: string) =>
      canvasElement.querySelector(
        `[row-id="${id}"] [col-id="balanceInReferenceCurrency"]`,
      );
    await waitFor(() => {
      expect(balance(REFERENCE_CURRENCY_TOTAL_FOOTER_ROW_ID)).toHaveTextContent(
        /\d/,
      );
      expect(balance("account-checking")).toHaveTextContent(/\d/);
    });
    const totalBefore = balance(
      REFERENCE_CURRENCY_TOTAL_FOOTER_ROW_ID,
    )!.textContent;
    const checkingBefore = balance("account-checking")!.textContent;
    await selectAssignmentAccount(canvasElement, "account-checking");
    await userEvent.click(
      canvas.getByRole("button", { name: "Set Tracking Method" }),
    );
    const dialog = within(await findVisibleDialog(body, "Set Tracking Method"));
    await userEvent.click(dialog.getByLabelText("Tracking Method"));
    await userEvent.click(body.getByRole("option", { name: "Total Value" }));
    await userEvent.click(dialog.getByRole("button", { name: "Apply" }));
    await waitFor(() =>
      expect(balance(managedId)).toHaveTextContent(checkingBefore!),
    );
    await expect(
      canvasElement.querySelector(
        `[row-id="${managedId}"] [col-id="ag-Grid-AutoColumn"]`,
      ),
    ).toHaveTextContent("Total Value Accounts");
    await expect(
      balance(REFERENCE_CURRENCY_TOTAL_FOOTER_ROW_ID),
    ).toHaveTextContent(totalBefore!);
    await expect(
      canvasElement.querySelector(
        '[row-id="account-checking"] [col-id="path"]',
      ),
    ).toHaveTextContent("Portfolio");
    await expect(
      canvasElement.querySelector(
        `[row-id="${archivedClassRowId(unitRowId(classId, "CURRENCY:CHF"))}"]`,
      ),
    ).not.toBeNull();
    await expect(
      canvas.queryByRole("toolbar", { name: "Selected Account Actions" }),
    ).not.toBeInTheDocument();
  },
};
