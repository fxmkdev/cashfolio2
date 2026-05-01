import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  resetAndSeedDatabase,
  seedExplicitGainLossDrilldownScenario,
  seedNonZeroConvertibleAssetBalances,
  seedSecurityGainLossDrilldownScenario,
  type SeededData,
} from "../support/db";

let seeded: SeededData;

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function gridRowByText(container: Locator, text: string): Locator {
  return container
    .locator(".ag-center-cols-container .ag-row")
    .filter({ hasText: text })
    .first();
}

async function selectSegmentedControlOption(
  control: Locator,
  optionName: string,
) {
  const option = control.getByRole("radio", { name: optionName });

  if (await option.isChecked()) {
    return;
  }

  await control.scrollIntoViewIfNeeded();
  await option.focus();
  await option.press("Space");

  if (!(await option.isChecked())) {
    const optionLabel = control
      .locator("label")
      .filter({
        hasText: new RegExp(`^\\s*${escapeRegExp(optionName)}\\s*$`),
      })
      .first();

    if ((await optionLabel.count()) > 0) {
      await optionLabel.scrollIntoViewIfNeeded();
      await optionLabel.click();
    }
  }

  if (!(await option.isChecked())) {
    await option.check({ force: true });
  }

  await expect(option).toBeChecked({ timeout: 15000 });
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

  await expect(page).toHaveURL(
    new RegExp(`/${seeded.accountBookId}/[^/?]+\\?period=${period}$`),
  );
  await expect(
    page.getByText("Showing entries for January 2026"),
  ).toBeVisible();
  await expect(page.getByText("E2E Convertible Asset Balances Seed")).toBeVisible();
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

  await expect(page).toHaveURL(
    new RegExp(
      `/${seeded.accountBookId}/${seeded.securityAccount.id}\\?period=${period}&transactionId=${gainLossSeed.sellTransactionId}$`,
    ),
  );
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
