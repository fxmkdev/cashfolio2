import {
  assetClassSelection,
  withAssetClassId,
} from "../../src/server/classification-data";
import { defaultAssetClassIds } from "../../src/shared/asset-class";

import { defaultStringifySearch } from "@tanstack/react-router";
import { prisma } from "../support/db-client";
import {
  seedDatabase,
  seedExplicitGainLossDrilldownScenario,
  seedNonZeroConvertibleAssetBalances,
  seedSecurityGainLossDrilldownScenario,
  type SeededData,
} from "../support/db";
import { expect, test, type Locator, type Page } from "../support/fixtures";
import { selectSegmentedControlOption } from "../support/segmented-control";
import { selectReportGrouping } from "../support/report-page";

let seeded: SeededData;

function gridRowByText(container: Locator, text: string): Locator {
  return container
    .locator(".ag-grid-scrolling-container > .ag-row")
    .filter({ hasText: text })
    .first();
}

async function openTableView(args: {
  page: Page;
  controlName: string;
  tableTestId: string;
  maxAttempts?: number;
}): Promise<Locator> {
  const control = args.page.getByRole("radiogroup", {
    name: args.controlName,
  });
  const table = args.page.getByTestId(args.tableTestId);
  const maxAttempts = args.maxAttempts ?? 4;
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await selectSegmentedControlOption(control, "Table");
      await expect(table).toBeVisible({ timeout: 3_000 });
      return table;
    } catch (error) {
      lastError = error;
      if (attempt < maxAttempts) {
        await args.page.waitForTimeout(150);
      }
    }
  }

  throw new Error(
    `Failed to open table view for "${args.controlName}" after ${maxAttempts} attempts.`,
    { cause: lastError },
  );
}

async function doubleClickRowUntilLedgerNavigation(args: {
  page: Page;
  row: Locator;
  accountBookId: string;
  period: string;
  maxAttempts?: number;
}) {
  const maxAttempts = args.maxAttempts ?? 4;
  const ledgerPathPattern = new RegExp(`^/${args.accountBookId}/[^/]+$`);
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await args.row.dblclick();
      await expect
        .poll(
          () => {
            const url = new URL(args.page.url());
            return {
              matchesLedgerPath: ledgerPathPattern.test(url.pathname),
              isPeriodRoute: url.pathname === `/${args.accountBookId}/report`,
              period: url.searchParams.get("period"),
            };
          },
          { timeout: 2_500 },
        )
        .toEqual({
          matchesLedgerPath: true,
          isPeriodRoute: false,
          period: args.period,
        });
      return;
    } catch (error) {
      lastError = error;
      if (attempt < maxAttempts) {
        await args.page.waitForTimeout(150);
      }
    }
  }

  throw new Error(
    `Failed to open ledger from period drilldown after ${maxAttempts} attempts.`,
    { cause: lastError },
  );
}

async function expandRowIfCollapsed(row: Locator) {
  const expandToggle = row.locator(".ag-group-contracted").first();
  if (await expandToggle.isVisible()) {
    await expandToggle.click();
  }
}

async function expandGainLossGroup(table: Locator, nodeId: string) {
  const row = table.locator(
    `.ag-grid-scrolling-container > .ag-row[row-id="${nodeId}"]`,
  );
  await expect(row).toBeVisible();
  await expandRowIfCollapsed(row);
}

test.beforeAll(async ({ e2eExternalId }) => {
  seeded = await seedDatabase({ userExternalId: e2eExternalId });
});

test("period allocation table account drilldown opens ledger with selected period", async ({
  page,
}) => {
  const period = "2026-01";
  const seededBalances = await seedNonZeroConvertibleAssetBalances({
    accountBookId: seeded.accountBookId,
    counterAccountId: seeded.cashAccount.id,
  });

  await page.goto(`/${seeded.accountBookId}/report?period=${period}`);
  await expect(
    page.getByRole("heading", { name: "January 2026" }),
  ).toBeVisible();

  const allocationTable = await openTableView({
    page,
    controlName: "Allocation Chart Type",
    tableTestId: "period-allocation-breakdown-table",
  });

  const usdRow = gridRowByText(allocationTable, seededBalances.usdAccountName);
  await expect(usdRow).toBeVisible();
  await doubleClickRowUntilLedgerNavigation({
    page,
    row: usdRow,
    accountBookId: seeded.accountBookId,
    period,
  });

  await expect
    .poll(() => {
      const url = new URL(page.url());
      return {
        pathname: url.pathname,
        period: url.searchParams.get("period"),
      };
    })
    .toEqual({
      pathname: expect.stringMatching(
        new RegExp(`^/${seeded.accountBookId}/[^/]+$`),
      ),
      period,
    });
  expect(new URL(page.url()).pathname).not.toBe(
    `/${seeded.accountBookId}/report`,
  );
  await expect(page.getByTestId("period-picker-trigger")).toContainText(
    "January 2026",
  );
  await expect(
    page.getByText("E2E Convertible Asset Balances Seed"),
  ).toBeVisible();
});

test("period gains/losses table account drilldown opens reconciliation page and event ledger link", async ({
  page,
}) => {
  const period = "2026-02";
  const gainLossSeed = await seedSecurityGainLossDrilldownScenario({
    accountBookId: seeded.accountBookId,
    securityAccountId: seeded.securityAccount.id,
    counterAccountId: seeded.cashAccount.id,
  });

  await page.goto(`/${seeded.accountBookId}/report?period=${period}`);
  await expect(
    page.getByRole("heading", { name: "February 2026" }),
  ).toBeVisible();

  const gainsLossesTable = await openTableView({
    page,
    controlName: "Gains/Losses Chart Type",
    tableTestId: "period-gains-losses-breakdown-table",
  });

  await expect(
    page.getByRole("combobox", { name: "Group Accounts By" }),
  ).toHaveValue("Account Structure");
  const structureGroupRow = gridRowByText(gainsLossesTable, "Assets");
  await expect(structureGroupRow).toBeVisible();
  await expandRowIfCollapsed(structureGroupRow);
  await gridRowByText(gainsLossesTable, seeded.securityAccount.name).dblclick();
  await expect(page).toHaveURL(
    new RegExp(
      `/${seeded.accountBookId}/report/gains-losses/${seeded.securityAccount.id}\\?period=${period}$`,
    ),
  );
  await expect(
    page.getByRole("heading", {
      name: new RegExp(seeded.securityAccount.name),
    }),
  ).toBeVisible();
  await page.goBack();
  await expect(gainsLossesTable).toBeVisible();
  await selectReportGrouping(page, "Asset Class");

  const assetClassRow = gridRowByText(gainsLossesTable, "Equities");
  await expect(assetClassRow).toBeVisible();
  await expandRowIfCollapsed(assetClassRow);
  await expandGainLossGroup(
    gainsLossesTable,
    "gain-loss-investment:EQUITIES:SECURITY:AAPL",
  );

  const securityAccountRow = gridRowByText(
    gainsLossesTable,
    seeded.securityAccount.name,
  );
  await expect(securityAccountRow).toBeVisible();
  await securityAccountRow.dblclick();

  await expect(page).toHaveURL(
    new RegExp(
      `/${seeded.accountBookId}/report/gains-losses/${seeded.securityAccount.id}\\?period=${period}$`,
    ),
  );
  await expect(
    page.getByRole("heading", {
      name: new RegExp(seeded.securityAccount.name),
    }),
  ).toBeVisible();

  const realizedEventRow = page
    .locator(".ag-grid-scrolling-container > .ag-row")
    .filter({ hasText: gainLossSeed.sellDescription })
    .first();
  await expect(realizedEventRow).toBeVisible();
  await realizedEventRow.hover();
  const realizedEventRowId = await realizedEventRow.getAttribute("row-id");
  expect(realizedEventRowId).toBeTruthy();
  await page
    .locator(`.ag-row[row-id="${realizedEventRowId}"]`)
    .getByRole("button", { name: "Open in Ledger" })
    .first()
    .click();

  await expect
    .poll(() => {
      const url = new URL(page.url());
      return {
        pathname: url.pathname,
        period: url.searchParams.get("period"),
        transactionId: url.searchParams.get("transactionId"),
      };
    })
    .toEqual({
      pathname: `/${seeded.accountBookId}/${seeded.securityAccount.id}`,
      period,
      transactionId: gainLossSeed.sellTransactionId,
    });
  await expect(page.getByText(gainLossSeed.sellDescription)).toBeVisible();
});

test("period recorded gains/losses rows open the reference-currency account explanation", async ({
  page,
}) => {
  const period = "2026-01";
  await seedExplicitGainLossDrilldownScenario({
    accountBookId: seeded.accountBookId,
    counterAccountId: seeded.cashAccount.id,
  });

  await page.goto(`/${seeded.accountBookId}/report?period=${period}`);
  await selectReportGrouping(page, "Asset Class");
  await expect(
    page.getByRole("heading", { name: "January 2026" }),
  ).toBeVisible();

  const gainsLossesTable = await openTableView({
    page,
    controlName: "Gains/Losses Chart Type",
    tableTestId: "period-gains-losses-breakdown-table",
  });

  await expandGainLossGroup(gainsLossesTable, "asset-class:unclassified");
  await expandGainLossGroup(
    gainsLossesTable,
    "gain-loss-investment:unclassified:CURRENCY:CHF",
  );
  const explicitRow = gridRowByText(gainsLossesTable, seeded.cashAccount.name);
  await expect(explicitRow).toBeVisible();
  await explicitRow.dblclick();

  await expect(page).toHaveURL(
    new RegExp(
      `/${seeded.accountBookId}/report/gains-losses/${seeded.cashAccount.id}\\?period=${period}$`,
    ),
  );
  await expect(page.getByTestId("period-picker-trigger")).toContainText(
    "January 2026",
  );
  await expect(
    page.getByRole("heading", { name: "Recorded Adjustments" }),
  ).toBeVisible();
  await expect(page.getByText("E2E Explicit Gain/Loss Seed")).toBeVisible();
  await page
    .getByRole("button", { name: "Open Transaction", exact: true })
    .click();
  await expect(page).toHaveURL(
    new RegExp(`/${seeded.accountBookId}/transactions\\?period=${period}`),
  );
  await expect(
    page.getByRole("link", { name: "Transactions", exact: true }),
  ).toHaveAttribute("data-active", "true");
  const details = page.getByRole("region", {
    name: "Transaction details: E2E Explicit Gain/Loss Seed",
  });
  await expect(details).toBeVisible();
  await expect(details).toContainText("2 bookings");
  await expect(details).toContainText(seeded.cashAccount.name);
  await page.goBack();
  await expect(page).toHaveURL(
    new RegExp(
      `/${seeded.accountBookId}/report/gains-losses/${seeded.cashAccount.id}\\?period=${period}$`,
    ),
  );
  await expect(
    page.getByRole("heading", { name: "Recorded Adjustments" }),
  ).toBeVisible();
});

for (const scenario of [
  {
    name: "month boundary",
    gainLossBookingDate: "2026-01-31",
    counterpartBookingDate: "2026-02-01",
    period: "2026-01",
    bookingDateLabels: ["31.01.2026", "01.02.2026"],
  },
  {
    name: "year boundary from a monthly explanation",
    gainLossBookingDate: "2025-12-31",
    counterpartBookingDate: "2026-01-01",
    period: "2025-12",
    bookingDateLabels: ["31.12.2025", "01.01.2026"],
  },
  {
    name: "year boundary from a yearly explanation",
    gainLossBookingDate: "2025-12-31",
    counterpartBookingDate: "2026-01-01",
    period: "2025",
    bookingDateLabels: ["31.12.2025", "01.01.2026"],
  },
] as const) {
  test(`recorded adjustment transaction links span the ${scenario.name}`, async ({
    page,
    e2eExternalId,
  }) => {
    const book = await seedDatabase({
      userExternalId: e2eExternalId,
      accountBookStartDate: new Date("2025-01-01T00:00:00Z"),
    });
    const adjustment = await seedExplicitGainLossDrilldownScenario({
      accountBookId: book.accountBookId,
      counterAccountId: book.cashAccount.id,
      gainLossBookingDate: new Date(
        `${scenario.gainLossBookingDate}T00:00:00Z`,
      ),
      counterpartBookingDate: new Date(
        `${scenario.counterpartBookingDate}T00:00:00Z`,
      ),
    });
    const periodSearch = defaultStringifySearch({ period: scenario.period });
    const explanationPath = `/${book.accountBookId}/report/gains-losses/${book.cashAccount.id}${periodSearch}`;
    await page.goto(explanationPath);
    await expect(page).toHaveURL(explanationPath);
    const recorded = page
      .getByRole("heading", { name: "Recorded Adjustments" })
      .locator("..");
    const adjustmentRow = recorded.getByRole("row").filter({
      hasText: "E2E Explicit Gain/Loss Seed",
    });
    await expect(adjustmentRow).toBeVisible();
    await expect(adjustmentRow.getByRole("cell").nth(2)).toContainText("25.00");
    const amount = await adjustmentRow.getByRole("cell").nth(2).innerText();

    await adjustmentRow
      .getByRole("button", { name: "Open Transaction" })
      .click();
    await expect
      .poll(() => {
        const url = new URL(page.url());
        return {
          path: url.pathname,
          period: url.searchParams.get("period"),
        };
      })
      .toEqual({
        path: `/${book.accountBookId}/transactions`,
        period: new URLSearchParams(periodSearch).get("period"),
      });
    const details = page.getByRole("region", {
      name: "Transaction details: E2E Explicit Gain/Loss Seed",
    });
    await expect(details).toBeVisible();
    await expect(details).toContainText("2 bookings");
    await expect(
      page
        .getByRole("grid", { name: "Transactions", exact: true })
        .locator(".ag-row.transaction-inspected"),
    ).toHaveAttribute("row-id", adjustment.transactionId);
    for (const date of scenario.bookingDateLabels) {
      await expect(
        details.getByRole("gridcell", { name: date, exact: true }),
      ).toBeVisible();
    }
    await expect(details).toContainText(book.cashAccount.name);
    await expect(details).toContainText(adjustment.gainLossAccountName);

    await page.goBack();
    await expect(page).toHaveURL(explanationPath);
    await expect(adjustmentRow.getByRole("cell").nth(2)).toHaveText(amount);
  });
}

test("archived manual portfolio reclassification moves historical G/L without changing the amount", async ({
  page,
  e2eExternalId,
}) => {
  const book = await seedDatabase({
    userExternalId: e2eExternalId,
    accountBookStartDate: new Date("2026-01-01T00:00:00Z"),
  });
  await prisma.account
    .update({
      include: { classifications: assetClassSelection },
      where: {
        id_accountBookId: {
          id: book.cashAccount.id,
          accountBookId: book.accountBookId,
        },
      },
      data: {
        name: "Archived CHF Equity Portfolio",
        isActive: false,
        trackingMethod: "TOTAL_PORTFOLIO_VALUE",
        classifications: {
          deleteMany: { schemeId: "assetClass" },
          create:
            defaultAssetClassIds.EQUITIES == null
              ? []
              : [
                  {
                    schemeId: "assetClass",
                    nodeId: defaultAssetClassIds.EQUITIES,
                  },
                ],
        },
      },
    })
    .then(withAssetClassId);

  await seedExplicitGainLossDrilldownScenario({
    accountBookId: book.accountBookId,
    counterAccountId: book.cashAccount.id,
  });
  const reportUrl = `/${book.accountBookId}/report?period=2026-01`;
  await page.goto(reportUrl);
  await selectReportGrouping(page, "Asset Class");
  let table = await openTableView({
    page,
    controlName: "Gains/Losses Chart Type",
    tableTestId: "period-gains-losses-breakdown-table",
  });
  await expect(gridRowByText(table, "Equities")).toBeVisible();
  await expandRowIfCollapsed(gridRowByText(table, "Equities"));
  await expandGainLossGroup(
    table,
    "gain-loss-investment:EQUITIES:managed-portfolios",
  );
  const amount = await gridRowByText(table, "Archived CHF Equity Portfolio")
    .locator('[col-id="totalGainLoss"]')
    .innerText();
  expect(amount).toMatch(/25/);
  await expect(table.getByText("Explicit G/L", { exact: true })).toHaveCount(0);
  const footer = await table
    .locator(".ag-grid-pinned-bottom-rows .ag-row-pinned")
    .innerText();
  await prisma.account
    .update({
      include: { classifications: assetClassSelection },
      where: {
        id_accountBookId: {
          id: book.cashAccount.id,
          accountBookId: book.accountBookId,
        },
      },
      data: {
        classifications: {
          deleteMany: { schemeId: "assetClass" },
          create:
            defaultAssetClassIds.OTHER_ASSETS == null
              ? []
              : [
                  {
                    schemeId: "assetClass",
                    nodeId: defaultAssetClassIds.OTHER_ASSETS,
                  },
                ],
        },
      },
    })
    .then(withAssetClassId);
  await page.reload();
  await expect(
    page.getByRole("combobox", { name: "Group Accounts By" }),
  ).toHaveValue("Asset Class");
  table = await openTableView({
    page,
    controlName: "Gains/Losses Chart Type",
    tableTestId: "period-gains-losses-breakdown-table",
  });
  await expect(gridRowByText(table, "Equities")).toHaveCount(0);
  await expect(gridRowByText(table, "Other Assets")).toBeVisible();
  await expandRowIfCollapsed(gridRowByText(table, "Other Assets"));
  await expandGainLossGroup(
    table,
    "gain-loss-investment:OTHER_ASSETS:managed-portfolios",
  );
  await expect(
    gridRowByText(table, "Archived CHF Equity Portfolio").locator(
      '[col-id="totalGainLoss"]',
    ),
  ).toHaveText(amount);
  expect(
    await table
      .locator(".ag-grid-pinned-bottom-rows .ag-row-pinned")
      .innerText(),
  ).toBe(footer);
  for (const mode of ["month", "year"]) {
    await page.goto(
      `/${book.accountBookId}/history?mode=${mode}&metric=gainsLosses&gainLossScope=asset-class:OTHER_ASSETS`,
    );
    await expect(page.getByRole("textbox", { name: "View" })).toHaveValue(
      "Other Assets",
    );
    await page.goto(
      `/${book.accountBookId}/history?mode=${mode}&metric=gainsLosses&gainLossScope=explicit-account:${book.cashAccount.id}`,
    );
    await expect(page.getByRole("textbox", { name: "View" })).toHaveValue(
      "Archived CHF Equity Portfolio",
    );
    await expect
      .poll(() => new URL(page.url()).searchParams.get("gainLossScope"))
      .toBe(`gain-loss-account:${book.cashAccount.id}`);
  }
});
