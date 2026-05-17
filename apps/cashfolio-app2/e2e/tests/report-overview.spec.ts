import { expect, test } from "@playwright/test";
import { agGridRowByText } from "../support/grid";
import {
  createReportPageSessionState,
  doubleClickBreakdownLeafUntilLedgerNavigation,
  seedReportPageSessionState,
} from "../support/report-page";
import {
  seedDatabase,
  seedAssetAccountWithMissingReferenceBalance,
  seedThreeBookingSplitTransaction,
  type SeededData,
} from "../support/db";
import { clickPeriodStepUntilQueryMatches } from "../support/period-navigation";
import { selectSegmentedControlOption } from "../support/segmented-control";

let seeded: SeededData;

test.beforeAll(async () => {
  seeded = await seedDatabase();
});

test("report page shows KPI waterfall and updated income/expenses wording", async ({
  page,
}) => {
  await page.goto(`/${seeded.accountBookId}/report`);
  await expect(page.getByRole("heading", { name: "April 2026" })).toBeVisible();

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
  await expect(
    page.getByRole("heading", { name: "Gains / Losses Breakdown" }),
  ).toBeVisible();

  await expect(page.getByText("Income").first()).toBeVisible();
  await expect(page.getByText("Expenses").first()).toBeVisible();
  const breakdownTypeControl = page.getByRole("radiogroup", {
    name: "Breakdown Type",
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
      /How Income, Expenses, and (Gain|Loss) lead to Total Return/,
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

test("period allocation shows partial-data warning when valuation is missing", async ({
  page,
}) => {
  await seedAssetAccountWithMissingReferenceBalance({
    accountBookId: seeded.accountBookId,
    counterAccountId: seeded.cashAccount.id,
  });

  await page.goto(`/${seeded.accountBookId}/report`);
  await expect(page.getByRole("heading", { name: "April 2026" })).toBeVisible();
  await expect(
    page.getByText(
      /skipped because reference-currency balances were unavailable\./,
    ),
  ).toBeVisible();
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

  await seedReportPageSessionState({
    page,
    accountBookId: seeded.accountBookId,
    state: createReportPageSessionState({
      drillPathByBreakdown: {
        expense: [
          `group:${seeded.equityGroupId}`,
          `group:${seeded.expenseGroupId}`,
        ],
        income: [],
      },
    }),
  });

  await page.goto(`/${seeded.accountBookId}/report?period=${period}`);

  await expect(page.getByRole("heading", { name: "April 2026" })).toBeVisible();
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
  await expect(page.getByTestId("period-picker-trigger")).toContainText(
    "April 2026",
  );
  await expect(agGridRowByText(page, seedDescription)).toBeVisible();
});

test("report page persists card state, drill state, and table expansion across refresh", async ({
  page,
}) => {
  const period = "2026-04";

  await seedThreeBookingSplitTransaction({
    accountBookId: seeded.accountBookId,
    description: "E2E Period Persistence Seed",
    currentAccountId: seeded.cashAccount.id,
    debitAccountIds: [seeded.expenseAccount.id, seeded.savingsAccount.id],
    date: "2026-04-07T00:00:00.000Z",
  });

  await page.goto(`/${seeded.accountBookId}/report?period=${period}`);
  await expect(page.getByRole("heading", { name: "April 2026" })).toBeVisible();

  const breakdownTypeControl = page.getByRole("radiogroup", {
    name: "Breakdown Type",
  });
  await selectSegmentedControlOption(breakdownTypeControl, "Expenses");

  const breakdownChartTypeControl = page.getByRole("radiogroup", {
    name: "Breakdown Chart Type",
  });
  await selectSegmentedControlOption(breakdownChartTypeControl, "Donut");

  const breakdownChart = page.getByTestId("period-breakdown-chart");
  await expect(breakdownChart).toBeVisible();
  await breakdownChart.dblclick({ force: true });
  await expect(
    page.getByText("Drilled expense groups in the selected period"),
  ).toBeVisible();

  await selectSegmentedControlOption(breakdownChartTypeControl, "Table");
  await expect(page.getByTestId("period-breakdown-table")).toBeVisible();

  const breakdownTable = page.getByTestId("period-breakdown-table");
  await breakdownTable.locator(".ag-group-expanded").first().click();
  await expect(agGridRowByText(page, seeded.expenseAccount.name)).toHaveCount(
    0,
  );

  await selectSegmentedControlOption(breakdownTypeControl, "Income");
  await expect(
    page.getByRole("heading", { name: "Income Breakdown" }),
  ).toBeVisible();

  const allocationTypeControl = page.getByRole("radiogroup", {
    name: "Allocation Type",
  });
  await selectSegmentedControlOption(allocationTypeControl, "Liabilities");

  const allocationChartTypeControl = page.getByRole("radiogroup", {
    name: "Allocation Chart Type",
  });
  await selectSegmentedControlOption(allocationChartTypeControl, "Bar");
  await expect(
    allocationChartTypeControl.getByRole("radio", { name: "Bar" }),
  ).toBeChecked();

  const gainsLossesChartTypeControl = page.getByRole("radiogroup", {
    name: "Gains/Losses Chart Type",
  });
  await selectSegmentedControlOption(gainsLossesChartTypeControl, "Table");
  await expect(
    gainsLossesChartTypeControl.getByRole("radio", { name: "Table" }),
  ).toBeChecked();
  await selectSegmentedControlOption(gainsLossesChartTypeControl, "Waterfall");
  await expect(
    gainsLossesChartTypeControl.getByRole("radio", { name: "Waterfall" }),
  ).toBeChecked();

  await page.reload();
  await expect(page.getByRole("heading", { name: "April 2026" })).toBeVisible();

  await expect(
    breakdownTypeControl.getByRole("radio", { name: "Income" }),
  ).toBeChecked();
  await expect(
    breakdownChartTypeControl.getByRole("radio", { name: "Table" }),
  ).toBeChecked();
  await expect(
    allocationTypeControl.getByRole("radio", { name: "Liabilities" }),
  ).toBeChecked();
  await expect(
    allocationChartTypeControl.getByRole("radio", { name: "Bar" }),
  ).toBeChecked();
  await expect(
    gainsLossesChartTypeControl.getByRole("radio", { name: "Waterfall" }),
  ).toBeChecked();

  await selectSegmentedControlOption(breakdownTypeControl, "Expenses");
  await expect(
    page.getByText("Drilled expense groups in the selected period"),
  ).toBeVisible();
  await expect(agGridRowByText(page, seeded.expenseAccount.name)).toHaveCount(
    0,
  );
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

  await page.goto(`/${seeded.accountBookId}/report?period=2025-04`);
  await expect(page.getByRole("heading", { name: "April 2025" })).toBeVisible();

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
    name: "Period Mode",
  });
  await periodModeControl.getByText("Year", { exact: true }).click();
  await expect(periodPickerTrigger).toContainText("2025");

  const yearPicker = await openPeriodPicker("period-year-picker");
  await expect(
    yearPicker.getByRole("button", { name: "2025" }),
  ).toHaveAttribute("data-selected", "true");
});

test("period previous/next controls update the period query parameter", async ({
  page,
}) => {
  await seedThreeBookingSplitTransaction({
    accountBookId: seeded.accountBookId,
    description: "E2E Period Step March Seed",
    currentAccountId: seeded.cashAccount.id,
    debitAccountIds: [seeded.savingsAccount.id, seeded.expenseAccount.id],
    date: "2026-03-07T00:00:00.000Z",
  });

  await seedThreeBookingSplitTransaction({
    accountBookId: seeded.accountBookId,
    description: "E2E Period Step April Seed",
    currentAccountId: seeded.cashAccount.id,
    debitAccountIds: [seeded.savingsAccount.id, seeded.expenseAccount.id],
    date: "2026-04-07T00:00:00.000Z",
  });

  await page.goto(`/${seeded.accountBookId}/report?period=2026-04`);
  await expect(page.getByRole("heading", { name: "April 2026" })).toBeVisible();

  const periodPickerTrigger = page.getByTestId("period-picker-trigger");
  await expect(periodPickerTrigger).toContainText("April 2026");

  await clickPeriodStepUntilQueryMatches({
    page,
    buttonName: "Previous Period",
    expectedPeriod: "2026-03",
  });
  await expect(periodPickerTrigger).toContainText("March 2026");

  await clickPeriodStepUntilQueryMatches({
    page,
    buttonName: "Next Period",
    expectedPeriod: "2026-04",
  });
  await expect(periodPickerTrigger).toContainText("April 2026");
});
