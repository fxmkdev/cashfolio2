import { expect, type Locator, type Page } from "@playwright/test";

export function agGridRowByText(page: Page, text: string): Locator {
  return page
    .locator(".ag-center-cols-container .ag-row")
    .filter({ hasText: text })
    .first();
}

export function agGridCellByColId(row: Locator, colId: string): Locator {
  return row.locator(`[col-id="${colId}"]`).first();
}

export function agGridPinnedBottomRow(page: Page): Locator {
  return page.locator(".ag-floating-bottom .ag-row-pinned").first();
}

export async function clickRowAction(
  row: Locator,
  actionLabel:
    | "Edit"
    | "Rebook"
    | "Delete"
    | "Archive"
    | "Unarchive"
    | "Reorder siblings",
) {
  await row.hover();
  await row.getByRole("button", { name: actionLabel }).click();
}

export async function setGridCellValue(
  page: Page,
  rowIndex: number,
  colId: string,
  value: string,
) {
  const cell = page
    .locator(
      `.ag-center-cols-container .ag-row[row-index="${rowIndex}"] [col-id="${colId}"]`,
    )
    .first();

  await expect(cell).toBeVisible();
  await cell.click({ force: true });

  let editorInput = page
    .locator(".ag-cell-inline-editing input:not([type='hidden'])")
    .first();

  if (!(await editorInput.isVisible())) {
    await cell.press("Enter");
    editorInput = page
      .locator(".ag-cell-inline-editing input:not([type='hidden'])")
      .first();
  }

  await expect(editorInput).toBeVisible();
  await editorInput.fill(value);
  await page.keyboard.press("Enter");
}
