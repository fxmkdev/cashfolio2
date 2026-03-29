import { expect, test, type ConsoleMessage, type Page } from "@playwright/test";
import {
  agGridCellByColId,
  agGridPinnedBottomRow,
  agGridRowByText,
  clickRowAction,
} from "../support/grid";
import {
  resetAndSeedDatabase,
  seedDashboardAssetAllocationBalances,
  seedAssetAccountWithMissingReferenceBalance,
  seedNonZeroConvertibleArchivedAndLiabilityBalances,
  seedNonZeroConvertibleAssetBalances,
  seedThreeBookingSplitTransaction,
  type SeededData,
} from "../support/db";
import { openDialogFromButton } from "../support/ui";

let seeded: SeededData;

test.beforeAll(async () => {
  seeded = await resetAndSeedDatabase();
});

async function expectDashboardPeriodInUrl(
  page: Page,
  accountBookId: string,
  period: "12m" | "10y",
) {
  await expect
    .poll(
      () => {
        const url = new URL(page.url());
        return {
          pathname: url.pathname.replace(/\/$/, ""),
          period: url.searchParams.get("period"),
        };
      },
      { timeout: 15_000 },
    )
    .toEqual({
      pathname: `/${accountBookId}/dashboard`,
      period: period === "10y" ? "10y" : null,
    });
}

async function selectDashboardPeriod(page: Page, period: "12m" | "10y") {
  const periodLabel = period === "10y" ? "Last 10 years" : "Last 12 months";
  const radioGroup = page.locator('[role="radiogroup"]:visible').first();
  const input = radioGroup
    .locator(`input[type="radio"][value="${period}"]`)
    .first();

  if ((await input.count()) === 0) {
    throw new Error(`Dashboard period radio not found for: ${period}`);
  }

  const optionLabel = radioGroup
    .locator("label")
    .filter({ hasText: periodLabel })
    .first();

  await expect(radioGroup).toBeVisible();
  await expect(input).toBeEnabled();
  await expect(optionLabel).toBeVisible();

  if (await input.isChecked()) {
    return;
  }

  await optionLabel.click();
  await expect(input).toBeChecked();
}

test("accounts is default account-book route and dashboard links to accounts", async ({
  page,
}) => {
  await page.goto(`/${seeded.accountBookId}`);

  await expect(page).toHaveURL(
    new RegExp(`/${seeded.accountBookId}/accounts\\?tab=ASSET&mode=active$`),
  );
  await expect(page.getByRole("heading", { name: "Accounts" })).toBeVisible();

  await page.getByRole("link", { name: "Dashboard" }).click();

  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Income & Expense Overview" }),
  ).toBeVisible();
  await expect(
    page.getByText("Last 12 months · Amounts shown in CHF"),
  ).toBeVisible();
  await expect(
    page.getByText(
      "No income or expense bookings found in the last 12 months.",
    ),
  ).toBeVisible();

  await selectDashboardPeriod(page, "10y");
  await expectDashboardPeriodInUrl(page, seeded.accountBookId, "10y");
  await expect(
    page.getByText("Last 10 years · Amounts shown in CHF"),
  ).toBeVisible();
  await expect(
    page.getByText("No income or expense bookings found in the last 10 years."),
  ).toBeVisible();

  await page.reload();
  await expectDashboardPeriodInUrl(page, seeded.accountBookId, "10y");
  await expect(
    page.getByText("Last 10 years · Amounts shown in CHF"),
  ).toBeVisible();

  await selectDashboardPeriod(page, "12m");
  await expectDashboardPeriodInUrl(page, seeded.accountBookId, "12m");
  await expect(
    page.getByText("Last 12 months · Amounts shown in CHF"),
  ).toBeVisible();

  await page.getByRole("link", { name: "Accounts" }).click();
  await expect(page).toHaveURL(
    new RegExp(`/${seeded.accountBookId}/accounts\\?tab=ASSET&mode=active$`),
  );
});

test("create, edit, archive, and unarchive account", async ({ page }) => {
  await page.goto(`/${seeded.accountBookId}/accounts?tab=ASSET&mode=active`);

  const createdName = "E2E Asset Account";
  const updatedName = "E2E Asset Account Updated";

  const newAccountDialog = await openDialogFromButton(page, {
    buttonName: "Add Account",
    dialogName: "New Account",
  });

  await newAccountDialog.getByLabel("Name").fill(createdName);
  await newAccountDialog.getByRole("textbox", { name: "Currency" }).click();
  await page.getByRole("option", { name: "CHF" }).first().click();
  await newAccountDialog.getByRole("button", { name: "Create" }).click();

  const createdRow = agGridRowByText(page, createdName);
  await expect(createdRow).toBeVisible();

  await clickRowAction(createdRow, "Edit");
  const editDialog = page.getByRole("dialog", { name: "Edit Account" });
  await expect(editDialog).toBeVisible();
  await editDialog.getByLabel("Name").fill(updatedName);
  await page
    .getByRole("dialog", { name: "Edit Account" })
    .getByRole("button", { name: "Save" })
    .click();

  const updatedRow = agGridRowByText(page, updatedName);
  await expect(updatedRow).toBeVisible();

  await clickRowAction(updatedRow, "Archive");
  const archiveDialog = page.getByRole("dialog", { name: "Archive Account" });
  await expect(archiveDialog).toBeVisible();
  await page
    .getByRole("dialog", { name: "Archive Account" })
    .getByRole("button", { name: "Archive" })
    .click();
  await expect(agGridRowByText(page, updatedName)).toHaveCount(0);

  await page.getByRole("link", { name: "Archive" }).click();
  const archivedRow = agGridRowByText(page, updatedName);
  await expect(archivedRow).toBeVisible();

  await archivedRow.dblclick();
  await expect(
    page.getByRole("button", { name: "Add Transaction" }),
  ).toBeVisible();
  await page.goto(`/${seeded.accountBookId}/accounts?tab=ASSET&mode=archived`);
  await expect(archivedRow).toBeVisible();

  await clickRowAction(archivedRow, "Unarchive");
  await expect(agGridRowByText(page, updatedName)).toHaveCount(0);

  await page.goto(`/${seeded.accountBookId}/accounts?tab=ASSET&mode=active`);
  const unarchivedRow = agGridRowByText(page, updatedName);
  await expect(unarchivedRow).toBeVisible();
});

test("navigate from accounts grid to ledger", async ({ page }) => {
  await page.goto(`/${seeded.accountBookId}/accounts?tab=ASSET&mode=active`);

  const cashRow = agGridRowByText(page, seeded.cashAccount.name);
  await expect(cashRow).toBeVisible();
  await cashRow.dblclick();

  await expect(page).toHaveURL(
    new RegExp(`/${seeded.accountBookId}/${seeded.cashAccount.id}`),
  );
  await expect(
    page.getByRole("button", { name: "Add Transaction" }),
  ).toBeVisible();
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
  await expect(agGridCellByColId(cryptoRow, "balance")).toHaveText("2.00");
  await expect(
    agGridCellByColId(cryptoRow, "balanceInReferenceCurrency"),
  ).toHaveText("200.00");

  const securityRow = agGridRowByText(page, seededBalances.securityAccountName);
  await expect(agGridCellByColId(securityRow, "balance")).toHaveText("3.00");
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
  const agChartsErrors: string[] = [];
  const handleConsole = (message: ConsoleMessage) => {
    if (message.type() !== "error") return;
    const text = message.text();
    if (!text.includes("AG Charts")) return;
    agChartsErrors.push(text);
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
    await expect(agChartsErrors).toEqual([]);

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

test("dashboard asset allocation donut renders for positive top-level asset groups", async ({
  page,
}) => {
  await seedNonZeroConvertibleAssetBalances({
    accountBookId: seeded.accountBookId,
    counterAccountId: seeded.expenseAccount.id,
  });

  await seedDashboardAssetAllocationBalances({
    accountBookId: seeded.accountBookId,
    primaryAssetAccountId: seeded.cashAccount.id,
    counterAccountId: seeded.expenseAccount.id,
  });

  await page.goto(`/${seeded.accountBookId}`);
  await expect(page).toHaveURL(
    new RegExp(`/${seeded.accountBookId}/accounts\\?tab=ASSET&mode=active$`),
  );
  await page.getByRole("link", { name: "Dashboard" }).click();
  await expectDashboardPeriodInUrl(page, seeded.accountBookId, "12m");
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();

  const assetAllocationCard = page.getByTestId(
    "dashboard-asset-allocation-card",
  );

  await expect(assetAllocationCard).toBeVisible();
  await expect(
    assetAllocationCard.getByText(
      "No positive, convertible asset balances are available for allocation.",
    ),
  ).toHaveCount(0);
  await expect(
    assetAllocationCard.locator(".ag-charts-no-data-overlay"),
  ).toHaveCount(0);
  await expect(assetAllocationCard.getByText("No data to display")).toHaveCount(
    0,
  );

  const chartCanvas = assetAllocationCard.locator("canvas").first();
  await expect(chartCanvas).toBeVisible();
});
