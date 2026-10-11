import { expect, test } from "../support/fixtures";
import { seedDatabase } from "../support/db";
import { openEditTransaction } from "../support/transaction-form";
import { seedAccountGainLoss } from "../support/account-gain-loss-seeds";
import {
  agGridCellByColId,
  agGridRowByText,
  agGridPinnedBottomRow,
  setGridCellValue,
} from "../support/grid";

test("accumulated account G/L, nested totals, historical summary, and FIFO explanation", async ({
  page,
  e2eExternalId,
}) => {
  const book = await seedDatabase({
    userExternalId: e2eExternalId,
    accountBookStartDate: new Date("2026-01-01Z"),
  });
  const { source, destination } = await seedAccountGainLoss(
    book.accountBookId,
    book.cashAccount.id,
  );
  await page.goto(`/${book.accountBookId}/accounts`);
  await expect(
    page.getByRole("columnheader", {
      name: "G/L Since Start (CHF)",
      exact: true,
    }),
  ).toBeVisible();
  const row = agGridRowByText(page, destination.name);
  // Expand the tree path before inspecting the holding's cells.
  for (const name of ["Assets", "G/L Portfolio", "G/L Holdings"]) {
    const groupRow = agGridRowByText(page, name);
    const expand = groupRow.locator(".ag-group-contracted");
    if (await expand.isVisible()) await expand.click();
  }
  await expect(agGridCellByColId(row, "realizedGainLoss")).toHaveText("13.00");
  await expect(agGridCellByColId(row, "unrealizedGainLoss")).toHaveText("8.00");
  await expect(agGridCellByColId(row, "totalGainLoss")).toHaveText("21.00");
  for (const name of ["G/L Holdings", "G/L Portfolio"])
    await expect(
      agGridCellByColId(agGridRowByText(page, name), "totalGainLoss"),
    ).toHaveText("21.00");
  await expect(
    agGridCellByColId(agGridPinnedBottomRow(page), "totalGainLoss"),
  ).toHaveText("21.00");
  await row.dblclick();
  // Each figure has the same currency/text shape; stable IDs disambiguate the three summary values.
  await expect(page.getByTestId("account-gain-loss-realised")).toContainText(
    "13.00",
  );
  await page
    .getByRole("button", { name: "View Calculation", exact: true })
    .click();
  const calculation = page.getByRole("dialog", {
    name: "Gain/Loss Calculation",
    exact: true,
  });
  await expect(
    calculation.getByRole("heading", { name: "Unrealised Open Lots" }),
  ).toBeVisible();
  await calculation.getByText("Partial Sale", { exact: true }).click();
  const event = page.getByRole("dialog", { name: "Explain Realised Delta" });
  await expect(event.getByText("Lot Matches", { exact: true })).toBeVisible();
  await expect(event).toContainText("2.00000");
  await page.goto(`/${book.accountBookId}/${destination.id}?period=2026-02`);
  await expect(page.getByTestId("account-gain-loss-realised")).toContainText(
    "0.00",
  );
  await expect(page.getByTestId("account-gain-loss-unrealised")).toContainText(
    "16.00",
  );
  await expect(page.getByText(/Since .*As of .*28/)).toBeVisible();
  await page.goto(`/${book.accountBookId}/accounts?mode=archived`);
  const archived = agGridRowByText(page, source.name);
  for (const name of ["Assets", "G/L Portfolio", "G/L Holdings"]) {
    const expand = agGridRowByText(page, name).locator(".ag-group-contracted");
    if (await expand.isVisible()) await expand.click();
  }
  await expect(agGridCellByColId(archived, "totalGainLoss")).toHaveText("6.00");
  await expect(agGridCellByColId(archived, "realizedGainLoss")).toHaveText(
    "6.00",
  );
  await expect(agGridCellByColId(archived, "unrealizedGainLoss")).toHaveText(
    "0.00",
  );
  await expect(
    agGridCellByColId(agGridPinnedBottomRow(page), "totalGainLoss"),
  ).toHaveText("6.00");
});

test("G/L request failure can be retried without blocking the accounts page", async ({
  page,
  e2eExternalId,
}) => {
  const book = await seedDatabase({ userExternalId: e2eExternalId });
  let endpoint: string | undefined;
  page.on("response", async (response) => {
    if (!response.url().includes("/_serverFn/")) return;
    const body = await response.text().catch(() => "");
    if (body.includes("realizedGainLoss") && body.includes("totalGainLoss"))
      endpoint = response.url().split("?")[0];
  });
  await page.goto(`/${book.accountBookId}/accounts`);
  await expect.poll(() => endpoint).toBeTruthy();
  const pattern = `${endpoint}*`;
  let releaseFailure!: () => void;
  const failure = new Promise<void>((resolve) => {
    releaseFailure = resolve;
  });
  await page.route(pattern, async (route) => {
    await failure;
    await route.abort();
  });
  await page.getByRole("tab", { name: "Liability", exact: true }).click();
  await expect(page.locator(".mantine-Loader-root").first()).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Accounts", exact: true }),
  ).toBeVisible();
  releaseFailure();
  await expect(
    page.getByText("Gain/loss could not be loaded. Please try again."),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Accounts", exact: true }),
  ).toBeVisible();
  await page.unroute(pattern);
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(
    page.getByText("Gain/loss could not be loaded. Please try again."),
  ).not.toBeVisible();
  await expect(page.getByText(/Holding G\/L since/)).toBeVisible();
});

test("ledger G/L refreshes after editing execution proceeds", async ({
  page,
  e2eExternalId,
}) => {
  const book = await seedDatabase({
    userExternalId: e2eExternalId,
    accountBookStartDate: new Date("2026-01-01Z"),
  });
  const { destination } = await seedAccountGainLoss(
    book.accountBookId,
    book.cashAccount.id,
  );
  await page.goto(`/${book.accountBookId}/${destination.id}`);
  await expect(page.getByTestId("account-gain-loss-realised")).toContainText(
    "13.00",
  );
  await openEditTransaction(page, "Partial Sale");
  const dialog = page.getByRole("dialog", { name: "Edit Transaction" });
  const cashRow = dialog
    .locator(".ag-grid-scrolling-container > .ag-row")
    .filter({ hasText: book.cashAccount.name })
    .first();
  const rowIndex = Number(await cashRow.getAttribute("row-index"));
  await setGridCellValue(dialog, rowIndex, "debit", "20");
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByTestId("account-gain-loss-realised")).toContainText(
    "18.00",
  );
  await expect(page.getByTestId("account-gain-loss-unrealised")).toContainText(
    "8.00",
  );
  await expect(page.getByTestId("account-gain-loss-total")).toContainText(
    "26.00",
  );
});
