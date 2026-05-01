import { expect, test, type Locator } from "@playwright/test";
import {
  resetAndSeedDatabase,
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

async function expandRowIfCollapsed(row: Locator) {
  const expandToggle = row.locator(".ag-group-contracted").first();
  if (await expandToggle.isVisible()) {
    await expandToggle.click();
  }
}

test.beforeAll(async () => {
  seeded = await resetAndSeedDatabase();
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
  await expect(page.getByRole("heading", { name: "Period" })).toBeVisible();

  const allocationChartTypeControl = page.getByRole("radiogroup", {
    name: "Allocation chart type",
  });
  await selectSegmentedControlOption(allocationChartTypeControl, "Table");

  const allocationTable = page.getByTestId("period-allocation-breakdown-table");
  await expect(allocationTable).toBeVisible();

  const usdRow = gridRowByText(allocationTable, seededBalances.usdAccountName);
  await expect(usdRow).toBeVisible();
  await usdRow.dblclick();

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
  await expect(
    page.getByText("Showing entries for January 2026"),
  ).toBeVisible();
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
  await expect(page.getByRole("heading", { name: "Period" })).toBeVisible();

  const gainsLossesChartTypeControl = page.getByRole("radiogroup", {
    name: "Gains/losses chart type",
  });
  await selectSegmentedControlOption(gainsLossesChartTypeControl, "Table");

  const gainsLossesTable = page.getByTestId(
    "period-gains-losses-breakdown-table",
  );
  await expect(gainsLossesTable).toBeVisible();

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
  await realizedEventRow
    .getByRole("button", { name: "Open in ledger" })
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
  await expect(page.getByRole("heading", { name: "Period" })).toBeVisible();

  const gainsLossesChartTypeControl = page.getByRole("radiogroup", {
    name: "Gains/losses chart type",
  });
  await selectSegmentedControlOption(gainsLossesChartTypeControl, "Table");

  const gainsLossesTable = page.getByTestId(
    "period-gains-losses-breakdown-table",
  );
  await expect(gainsLossesTable).toBeVisible();

  const explicitRow = gridRowByText(gainsLossesTable, seeded.cashAccount.name);
  await expect(explicitRow).toBeVisible();
  await explicitRow.dblclick();

  await expect(page).toHaveURL(
    new RegExp(
      `/${seeded.accountBookId}/${explicitSeed.gainLossAccountId}\\?period=${period}$`,
    ),
  );
  await expect(
    page.getByText("Showing entries for January 2026"),
  ).toBeVisible();
  await expect(page.getByText("E2E Explicit Gain/Loss Seed")).toBeVisible();
});
