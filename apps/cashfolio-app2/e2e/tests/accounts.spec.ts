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
  const dashboardCard = page
    .getByRole("heading", { name: "Income & Expense Overview" })
    .locator(
      'xpath=ancestor::*[self::section or self::article or self::div][.//*[@role="radiogroup"]][1]',
    );
  const radioGroup = dashboardCard.getByRole("radiogroup", {
    name: "Dashboard period",
  });
  const optionTrigger = radioGroup.getByText(periodLabel, { exact: true });

  await expect(radioGroup).toBeVisible();
  await expect(optionTrigger).toBeVisible();
  await optionTrigger.click();
}

function isIgnorableAgChartsError(message: string): boolean {
  const normalizedMessage = message.replace(/\s+/g, " ").trim();
  const ignorableAgChartsErrorPatterns = [
    /^\*+ AG Charts Enterprise License \*+$/i,
    /^\* All AG Charts Enterprise features are unlocked for trial\..*\*$/i,
    /^AG Charts Enterprise:.*license.*$/i,
    /^AG Charts Enterprise:.*watermark.*$/i,
  ];

  return ignorableAgChartsErrorPatterns.some((pattern) =>
    pattern.test(normalizedMessage),
  );
}

async function doubleClickBreakdownLeafUntilLedgerNavigation(args: {
  page: Page;
  accountBookId: string;
  accountId: string;
  period: string;
}) {
  const breakdownChartTypeControl = args.page.getByRole("radiogroup", {
    name: "Breakdown chart type",
  });
  await breakdownChartTypeControl.getByRole("radio", { name: "Bar" }).click();

  const breakdownCard = args.page
    .getByRole("heading", { name: "Expenses Breakdown" })
    .locator(
      "xpath=ancestor::*[self::section or self::article or self::div][.//canvas][1]",
    );
  const chartCanvas = breakdownCard.locator("canvas").first();
  await expect(chartCanvas).toBeVisible();

  const chartBounds = await chartCanvas.boundingBox();
  if (!chartBounds) {
    throw new Error("Breakdown chart canvas bounds were not available.");
  }

  const expectedPath = `/${args.accountBookId}/${args.accountId}`;
  const clickTargets: Array<[number, number]> = [
    [0.5, 0.25],
    [0.5, 0.35],
    [0.5, 0.45],
    [0.45, 0.35],
    [0.55, 0.35],
    [0.5, 0.55],
  ];

  for (const [relativeX, relativeY] of clickTargets) {
    const x = Math.round(chartBounds.width * relativeX);
    const y = Math.round(chartBounds.height * relativeY);

    await chartCanvas.dblclick({
      position: { x, y },
      timeout: 5_000,
    });

    try {
      await expect
        .poll(
          () => {
            const url = new URL(args.page.url());
            return (
              url.pathname === expectedPath &&
              url.searchParams.get("period") === args.period
            );
          },
          { timeout: 1_500 },
        )
        .toBe(true);
      return;
    } catch {
      // Try the next coordinate if the previous click missed the bar.
    }
  }

  throw new Error(
    "Could not trigger account-leaf drilldown from the period breakdown chart.",
  );
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

  await page.goto(`/${seeded.accountBookId}/dashboard`);
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
  await newAccountDialog.getByRole("combobox", { name: "Currency" }).click();
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

test("period page shows KPI waterfall and updated income/expenses wording", async ({
  page,
}) => {
  await page.goto(`/${seeded.accountBookId}/period`);
  await expect(page.getByRole("heading", { name: "Period" })).toBeVisible();

  const waterfallHeading = page.getByRole("heading", {
    name: "Contribution to Total Return",
  });
  await expect(waterfallHeading).toBeVisible();
  const waterfallCard = waterfallHeading.locator(
    "xpath=ancestor::*[self::section or self::article or self::div][.//canvas][1]",
  );
  await expect(waterfallCard.locator("canvas")).toBeVisible();

  await expect(page.getByText("Total Income")).toHaveCount(0);
  await expect(page.getByText("Total Expenses")).toHaveCount(0);
  await expect(page.getByText("Gains / Losses")).toHaveCount(0);

  await expect(page.getByText("Income").first()).toBeVisible();
  await expect(page.getByText("Expenses").first()).toBeVisible();
  const breakdownTypeControl = page.getByRole("radiogroup", {
    name: "Breakdown type",
  });
  await expect(breakdownTypeControl).toBeVisible();
  await expect(
    breakdownTypeControl.getByRole("radio", { name: "Expenses" }),
  ).toBeChecked();
  await expect(
    page.getByText("Top-level groups for expenses in the selected period"),
  ).toBeVisible();

  await expect(
    page.getByText(
      /How Income, Expenses, and (Gains|Losses) lead to Total Return/,
    ),
  ).toBeVisible();

  const endOfPeriodSection = page
    .locator(
      "xpath=//div[.//*[normalize-space()='As of period end (last day)']]",
    )
    .first();
  await expect(endOfPeriodSection).toBeVisible();

  const parseStatCardAmount = async (label: string) => {
    const card = endOfPeriodSection
      .locator(
        `xpath=.//div[contains(@class,"mantine-Card-root")][.//*[normalize-space()="${label}"]]`,
      )
      .first();
    await expect(card).toBeVisible();

    const valueText = (await card.locator("p").nth(1).innerText()).trim();
    const numericMatch = valueText.match(/-?\d[\d'’]*(?:[.,]\d+)?/);
    if (!numericMatch) {
      throw new Error(`Could not parse stat amount from "${valueText}"`);
    }

    const parsedMagnitude = Number(
      numericMatch[0].replace(/[’']/g, "").replace(",", "."),
    );
    const isNegative = valueText.includes("-") || valueText.includes("−");

    return isNegative ? -Math.abs(parsedMagnitude) : parsedMagnitude;
  };

  const netWorth = await parseStatCardAmount("Net Worth");
  const assets = await parseStatCardAmount("Assets");
  const liabilities = await parseStatCardAmount("Liabilities");

  expect(Math.abs(netWorth - (assets - liabilities))).toBeLessThan(0.01);
});

test("period breakdown account leaf drilldown opens ledger with period filter", async ({
  page,
}) => {
  const period = "2026-04";
  const seedDescription = "E2E Period Ledger Drilldown Seed";

  await seedThreeBookingSplitTransaction({
    accountBookId: seeded.accountBookId,
    description: seedDescription,
    currentAccountId: seeded.cashAccount.id,
    debitAccountIds: [seeded.expenseAccount.id, seeded.savingsAccount.id],
    date: "2026-04-07T00:00:00.000Z",
  });

  await page.goto(
    `/${seeded.accountBookId}/period?period=${period}&expensePath=${encodeURIComponent(`group:${seeded.expenseGroupId}`)}`,
  );

  await expect(page.getByRole("heading", { name: "Period" })).toBeVisible();
  await expect(
    page.getByText(
      "Double-click a group to drill down, or an account to open ledger.",
    ),
  ).toBeVisible();

  await doubleClickBreakdownLeafUntilLedgerNavigation({
    page,
    accountBookId: seeded.accountBookId,
    accountId: seeded.expenseAccount.id,
    period,
  });

  await expect
    .poll(() => {
      const url = new URL(page.url());
      return {
        path: url.pathname,
        period: url.searchParams.get("period"),
      };
    })
    .toEqual({
      path: `/${seeded.accountBookId}/${seeded.expenseAccount.id}`,
      period,
    });
  await expect(page.getByText("Showing entries for April 2026")).toBeVisible();
  await expect(agGridRowByText(page, seedDescription)).toBeVisible();
});

test("period picker opens on selected month/year page", async ({ page }) => {
  await seedThreeBookingSplitTransaction({
    accountBookId: seeded.accountBookId,
    description: "E2E Period Min Date Seed",
    currentAccountId: seeded.cashAccount.id,
    debitAccountIds: [seeded.savingsAccount.id, seeded.expenseAccount.id],
    date: "2017-01-07T00:00:00.000Z",
  });

  await seedThreeBookingSplitTransaction({
    accountBookId: seeded.accountBookId,
    description: "E2E Period Selected Date Seed",
    currentAccountId: seeded.cashAccount.id,
    debitAccountIds: [seeded.savingsAccount.id, seeded.expenseAccount.id],
    date: "2025-04-07T00:00:00.000Z",
  });

  await page.goto(`/${seeded.accountBookId}/period?period=2025-04`);
  await expect(page.getByRole("heading", { name: "Period" })).toBeVisible();

  const periodPickerTrigger = page.getByTestId("period-picker-trigger");
  await expect(periodPickerTrigger).toContainText("April 2025");

  const openPeriodPicker = async (pickerTestId: string) => {
    const picker = page.getByTestId(pickerTestId);
    await periodPickerTrigger.click();

    try {
      await expect(picker).toBeVisible({ timeout: 2_000 });
    } catch {
      await periodPickerTrigger.click();
      await expect(picker).toBeVisible();
    }

    return picker;
  };

  const monthPicker = await openPeriodPicker("period-month-picker");
  await expect(monthPicker.getByRole("button", { name: "2025" })).toBeVisible();

  const periodModeControl = page.getByRole("radiogroup", {
    name: "Period mode",
  });
  await periodModeControl.getByText("Year", { exact: true }).click();
  await expect(periodPickerTrigger).toContainText("2025");

  const yearPicker = await openPeriodPicker("period-year-picker");
  await expect(
    yearPicker.getByRole("button", { name: "2025" }),
  ).toHaveAttribute("data-selected", "true");
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
