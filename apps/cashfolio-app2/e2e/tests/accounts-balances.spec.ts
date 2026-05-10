import { expect, test, type ConsoleMessage } from "@playwright/test";
import {
  agGridCellByColId,
  agGridPinnedBottomRow,
  agGridRowByText,
} from "../support/grid";
import { isIgnorableAgChartsError } from "../support/accounts-period-page";
import {
  seedDatabase,
  seedAssetAccountWithMissingReferenceBalance,
  seedNonZeroConvertibleArchivedAndLiabilityBalances,
  seedNonZeroConvertibleAssetBalances,
  seedThreeBookingSplitTransaction,
  type SeededData,
} from "../support/db";

let seeded: SeededData;

test.beforeAll(async () => {
  seeded = await seedDatabase();
});

test("balance column visibility and baseline values across tabs/modes", async ({
  page,
}) => {
  const seededBalances = await seedNonZeroConvertibleAssetBalances({
    accountBookId: seeded.accountBookId,
    counterAccountId: seeded.cashAccount.id,
  });
  const seededAdditionalTabBalances =
    await seedNonZeroConvertibleArchivedAndLiabilityBalances({
      accountBookId: seeded.accountBookId,
      counterAccountId: seeded.expenseAccount.id,
    });

  await page.goto(`/${seeded.accountBookId}/accounts?tab=ASSET&mode=active`);

  await expect(page.getByRole("columnheader", { name: "Ccy." })).toBeVisible();
  await expect(
    page.getByRole("columnheader", { name: "Symbol" }),
  ).toBeVisible();
  await expect(
    page.getByRole("columnheader", { name: "Balance", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("columnheader", { name: /^Balance \([A-Z]{3}\)$/ }),
  ).toBeVisible();
  const assetFooterRow = agGridPinnedBottomRow(page);
  await expect(assetFooterRow).toContainText("Total");
  await expect(
    agGridCellByColId(assetFooterRow, "balanceInReferenceCurrency"),
  ).toHaveText("205.00");

  const cashRow = agGridRowByText(page, seeded.cashAccount.name);
  await expect(agGridCellByColId(cashRow, "balance")).toHaveText("-15.00");
  await expect(
    agGridCellByColId(cashRow, "balanceInReferenceCurrency"),
  ).toHaveText("-15.00");

  const usdRow = agGridRowByText(page, seededBalances.usdAccountName);
  await expect(agGridCellByColId(usdRow, "balance")).toHaveText("10.00");
  await expect(
    agGridCellByColId(usdRow, "balanceInReferenceCurrency"),
  ).toHaveText("5.00");

  const cryptoRow = agGridRowByText(page, seededBalances.cryptoAccountName);
  await expect(agGridCellByColId(cryptoRow, "balance")).toHaveText("2.00000");
  await expect(
    agGridCellByColId(cryptoRow, "balanceInReferenceCurrency"),
  ).toHaveText("200.00");

  const securityRow = agGridRowByText(page, seededBalances.securityAccountName);
  await expect(agGridCellByColId(securityRow, "balance")).toHaveText("3");
  await expect(
    agGridCellByColId(securityRow, "balanceInReferenceCurrency"),
  ).toHaveText("15.00");

  const assetsGroupRow = agGridRowByText(page, "Assets");
  await expect(agGridCellByColId(assetsGroupRow, "balance")).toHaveText(
    /^\s*$/,
  );
  await expect(
    agGridCellByColId(assetsGroupRow, "balanceInReferenceCurrency"),
  ).toHaveText("205.00");

  await page.getByRole("link", { name: "Archive" }).click();
  await expect(
    page.getByRole("columnheader", { name: "Balance", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("columnheader", { name: /^Balance \([A-Z]{3}\)$/ }),
  ).toBeVisible();
  const archivedFooterRow = agGridPinnedBottomRow(page);
  await expect(archivedFooterRow).toContainText("Total");
  await expect(
    agGridCellByColId(archivedFooterRow, "balanceInReferenceCurrency"),
  ).toHaveText("4.00");
  const archivedUsdRow = agGridRowByText(
    page,
    seededAdditionalTabBalances.archivedAssetAccountName,
  );
  await expect(agGridCellByColId(archivedUsdRow, "balance")).toHaveText("8.00");
  await expect(
    agGridCellByColId(archivedUsdRow, "balanceInReferenceCurrency"),
  ).toHaveText("4.00");

  await page.goto(
    `/${seeded.accountBookId}/accounts?tab=LIABILITY&mode=active`,
  );
  await expect(
    page.getByRole("columnheader", { name: "Balance", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("columnheader", { name: /^Balance \([A-Z]{3}\)$/ }),
  ).toBeVisible();
  const liabilityFooterRow = agGridPinnedBottomRow(page);
  await expect(liabilityFooterRow).toContainText("Total");
  await expect(
    agGridCellByColId(liabilityFooterRow, "balanceInReferenceCurrency"),
  ).toHaveText("-3.00");
  const liabilityUsdRow = agGridRowByText(
    page,
    seededAdditionalTabBalances.liabilityAccountName,
  );
  await expect(agGridCellByColId(liabilityUsdRow, "balance")).toHaveText(
    "-6.00",
  );
  await expect(
    agGridCellByColId(liabilityUsdRow, "balanceInReferenceCurrency"),
  ).toHaveText("-3.00");

  await page.goto(
    `/${seeded.accountBookId}/accounts?tab=EQUITY-${encodeURIComponent("EXPENSE")}&mode=active`,
  );
  await expect(
    page.getByRole("columnheader", { name: "Balance", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("columnheader", { name: /^Balance \([A-Z]{3}\)$/ }),
  ).toHaveCount(0);
  await expect(page.locator(".ag-row-pinned")).toHaveCount(0);
});

test("footer total stays blank when an account ref-currency balance is missing", async ({
  page,
}) => {
  const missingFxAccount = await seedAssetAccountWithMissingReferenceBalance({
    accountBookId: seeded.accountBookId,
    counterAccountId: seeded.cashAccount.id,
  });

  await page.goto(`/${seeded.accountBookId}/accounts?tab=ASSET&mode=active`);

  const missingFxRow = agGridRowByText(page, missingFxAccount.name);
  await expect(missingFxRow).toBeVisible();
  await expect(
    agGridCellByColId(missingFxRow, "balanceInReferenceCurrency"),
  ).toHaveText(/^\s*$/);

  const footerRow = agGridPinnedBottomRow(page);
  await expect(footerRow).toContainText("Total");
  await expect(
    agGridCellByColId(footerRow, "balanceInReferenceCurrency"),
  ).toHaveText(/^\s*$/);
});

test("asset ledger segmented links open chart and render a visible chart", async ({
  page,
}) => {
  const agChartsUnexpectedErrors: string[] = [];
  const handleConsole = (message: ConsoleMessage) => {
    if (message.type() !== "error") return;
    const text = message.text();
    if (!text.includes("AG Charts")) return;
    if (isIgnorableAgChartsError(text)) return;
    agChartsUnexpectedErrors.push(text);
  };

  page.on("console", handleConsole);

  await seedThreeBookingSplitTransaction({
    accountBookId: seeded.accountBookId,
    description: "E2E Chart Seed",
    currentAccountId: seeded.cashAccount.id,
    debitAccountIds: [seeded.savingsAccount.id, seeded.investmentsAccount.id],
    date: "2026-01-07T00:00:00.000Z",
  });

  try {
    await page.goto(`/${seeded.accountBookId}/accounts?tab=ASSET&mode=active`);

    const cashRow = agGridRowByText(page, seeded.cashAccount.name);
    await expect(cashRow).toBeVisible();
    await cashRow.dblclick();

    await expect(page.getByRole("link", { name: "Chart" })).toBeVisible();
    await page.getByRole("link", { name: "Chart" }).click();

    await expect(page).toHaveURL(
      new RegExp(`/${seeded.accountBookId}/${seeded.cashAccount.id}/chart$`),
    );
    await expect(
      page.getByText("No bookings available for this account yet."),
    ).toHaveCount(0);

    const chartCanvas = page.locator(".ag-charts-wrapper canvas").first();
    await expect(chartCanvas).toBeVisible();
    await expect(agChartsUnexpectedErrors).toEqual([]);

    await page.getByRole("link", { name: "Ledger" }).click();
    await expect(page).toHaveURL(
      new RegExp(`/${seeded.accountBookId}/${seeded.cashAccount.id}$`),
    );
    await expect(
      page.getByRole("button", { name: "Add Transaction" }),
    ).toBeVisible();
  } finally {
    page.off("console", handleConsole);
  }
});
