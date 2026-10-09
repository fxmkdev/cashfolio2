import { expect, type Locator, type Page } from "@playwright/test";

export function agGridRowByText(page: Page, text: string): Locator {
  return page
    .locator(".ag-grid-scrolling-container > .ag-row:not(.ag-full-width-row)")
    .filter({ hasText: text })
    .first();
}

export function agGridCellByColId(row: Locator, colId: string): Locator {
  return row.locator(`.ag-cell[col-id="${colId}"]`).first();
}

export function agGridPinnedBottomRow(page: Page): Locator {
  return page.locator(".ag-grid-pinned-bottom-rows .ag-row-pinned").first();
}

export async function clickRowAction(
  row: Locator,
  actionLabel:
    | "Edit"
    | "Copy"
    | "Rebook"
    | "Delete"
    | "Archive"
    | "Unarchive"
    | "Reorder Siblings",
) {
  await row.hover();
  await row.getByRole("button", { name: actionLabel }).click();
}

export async function clickPinnedRowAction(args: {
  row: Locator;
  actionLabel: string;
}) {
  await args.row.hover();
  // v36 keeps pinned and scrolling cells inside the same row element.
  const action = args.row
    .locator(":scope > .ag-grid-pinned-right-cells")
    .getByRole("button", { name: args.actionLabel });
  await expect(action).toBeVisible();
  await action.click();
}

export async function clickGridRowSelectionCheckbox(row: Locator) {
  const checkbox = row.locator(".ag-selection-checkbox").first();
  await expect(checkbox).toBeVisible();
  await checkbox.click();
}

export async function setGridCellValue(
  root: Page | Locator,
  rowIndex: number,
  colId: string,
  value: string,
) {
  const cell = root
    .locator(
      `.ag-grid-scrolling-container > .ag-row[row-index="${rowIndex}"] [col-id="${colId}"]`,
    )
    .first();

  await expect(cell).toBeVisible();
  await cell.click({ force: true });

  let editorInput = root
    .locator(".ag-cell-inline-editing input:not([type='hidden'])")
    .first();

  if (!(await editorInput.isVisible())) {
    await cell.press("Enter");
    editorInput = root
      .locator(".ag-cell-inline-editing input:not([type='hidden'])")
      .first();
  }

  await expect(editorInput).toBeVisible();
  await editorInput.fill(value);
  const page = "keyboard" in root ? root : root.page();
  await page.keyboard.press("Enter");
}

function accountOptionNameRegex(name: string): RegExp {
  return new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
}

function accountLeafOption(page: Page, name: string): Locator {
  return page
    .getByRole("option", {
      name: accountOptionNameRegex(name),
    })
    .filter({ hasNot: page.getByRole("button") })
    .first();
}

async function searchFocusedAccountTree(page: Page, name: string) {
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.type(name);
}

export async function selectAccountTreeLeaf(page: Page, name: string) {
  await searchFocusedAccountTree(page, name);
  const option = accountLeafOption(page, name);
  await expect(option).toBeVisible();
  await option.click();
}

export async function setGridAccountTreeCellValue(args: {
  root: Page | Locator;
  rowIndex: number;
  colId: string;
  accountName: string;
}) {
  const cell = args.root
    .locator(
      `.ag-grid-scrolling-container > .ag-row[row-index="${args.rowIndex}"] [col-id="${args.colId}"]`,
    )
    .first();

  await expect(cell).toBeVisible();
  await cell.click({ force: true });

  let editorInput = args.root
    .locator(".ag-cell-inline-editing input:not([type='hidden'])")
    .first();
  if (!(await editorInput.isVisible())) {
    await cell.press("Enter");
    editorInput = args.root
      .locator(".ag-cell-inline-editing input:not([type='hidden'])")
      .first();
  }

  await expect(editorInput).toBeVisible();
  await editorInput.fill(args.accountName);

  const page = "keyboard" in args.root ? args.root : args.root.page();
  const option = accountLeafOption(page, args.accountName);
  await expect(option).toBeVisible({ timeout: 3000 });
  await option.click();
  await page.keyboard.press("Enter");
}
