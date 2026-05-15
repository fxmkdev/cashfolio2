import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  seedDatabase,
  seedExplicitGainLossDrilldownScenario,
  seedNonZeroConvertibleAssetBalances,
  seedSecurityGainLossDrilldownScenario,
  type SeededData,
} from "../support/db";
import { selectSegmentedControlOption } from "../support/segmented-control";

let seeded: SeededData;

function gridRowByText(container: Locator, text: string): Locator {
  return container
    .locator(".ag-center-cols-container .ag-row")
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
              isPeriodRoute: url.pathname === `/${args.accountBookId}/period`,
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

test.beforeAll(async () => {
  seeded = await seedDatabase();
});

test("period allocation table account drilldown opens ledger with selected period", async ({
  page,
}) => {
  const period = "2026-01";
  const seededBalances = await seedNonZeroConvertibleAssetBalances({
    accountBookId: seeded.accountBookId,
    counterAccountId: seeded.cashAccount.id,
  });

  await page.goto(`/${seeded.accountBookId}/period?period=${period}`);
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
    `/${seeded.accountBookId}/period`,
  );
  await expect(page.getByTestId("period-picker-trigger")).toContainText(
    "January 2026",
  );
  await expect(
    page.getByText("E2E Convertible Asset Balances Seed"),
  ).toBeVisible();
});

test("period gains/losses table unit-account drilldown opens reconciliation page and event ledger link", async ({
  page,
}) => {
  const period = "2026-02";
  const gainLossSeed = await seedSecurityGainLossDrilldownScenario({
    accountBookId: seeded.accountBookId,
    securityAccountId: seeded.securityAccount.id,
    counterAccountId: seeded.cashAccount.id,
  });

  await page.goto(`/${seeded.accountBookId}/period?period=${period}`);
  await expect(
    page.getByRole("heading", { name: "February 2026" }),
  ).toBeVisible();

  const gainsLossesTable = await openTableView({
    page,
    controlName: "Gains/Losses Chart Type",
    tableTestId: "period-gains-losses-breakdown-table",
  });

  const securityUnitRow = gridRowByText(gainsLossesTable, "AAPL (USD)");
  await expect(securityUnitRow).toBeVisible();
  await expandRowIfCollapsed(securityUnitRow);

  const securityAccountRow = gridRowByText(
    gainsLossesTable,
    seeded.securityAccount.name,
  );
  await expect(securityAccountRow).toBeVisible();
  await securityAccountRow.dblclick();

  await expect(page).toHaveURL(
    new RegExp(
      `/${seeded.accountBookId}/period/gains-losses/${seeded.securityAccount.id}\\?period=${period}$`,
    ),
  );
  await expect(
    page.getByRole("heading", {
      name: new RegExp(seeded.securityAccount.name),
    }),
  ).toBeVisible();

  const realizedEventRow = page
    .locator(".ag-center-cols-container .ag-row")
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

test("period explicit gains/losses rows drill to gain/loss ledger", async ({
  page,
}) => {
  const period = "2026-01";
  const explicitSeed = await seedExplicitGainLossDrilldownScenario({
    accountBookId: seeded.accountBookId,
    counterAccountId: seeded.cashAccount.id,
  });

  await page.goto(`/${seeded.accountBookId}/period?period=${period}`);
  await expect(
    page.getByRole("heading", { name: "January 2026" }),
  ).toBeVisible();

  const gainsLossesTable = await openTableView({
    page,
    controlName: "Gains/Losses Chart Type",
    tableTestId: "period-gains-losses-breakdown-table",
  });

  const explicitRow = gridRowByText(gainsLossesTable, seeded.cashAccount.name);
  await expect(explicitRow).toBeVisible();
  await explicitRow.dblclick();

  await expect(page).toHaveURL(
    new RegExp(
      `/${seeded.accountBookId}/${explicitSeed.gainLossAccountId}\\?period=${period}$`,
    ),
  );
  await expect(page.getByTestId("period-picker-trigger")).toContainText(
    "January 2026",
  );
  await expect(page.getByText("E2E Explicit Gain/Loss Seed")).toBeVisible();
});
