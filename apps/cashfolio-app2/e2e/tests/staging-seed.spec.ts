import { expandArchivedGroups } from "../support/grid";
import { Buffer } from "node:buffer";
import { formatUtcDateForLocale } from "../../src/shared/date";
import {
  generateStagingDataset,
  generateStatementImportSample,
} from "../../src/staging-seed/dataset";
import {
  insertSeedBooks,
  type SeedSummary,
} from "../../src/staging-seed/writer";
import {
  agGridCellByColId,
  agGridPinnedBottomRow,
  agGridRowByText,
  setGridAccountTreeCellValue,
} from "../support/grid";
import { assertSafeWriteTarget, prisma } from "../support/db-client";
import { expect, test } from "../support/fixtures";
import { selectSegmentedControlOption } from "../support/segmented-control";

const today = new Date("2026-10-10T00:00:00Z");
let seeded: SeedSummary;
let bankAccountId: string;

function seededBook(key: string) {
  const book = seeded.books.find((candidate) => candidate.key === key);
  if (!book) throw new Error(`Missing synthetic book ${key}.`);
  return book;
}

test.beforeAll(async ({ e2eExternalId }) => {
  assertSafeWriteTarget();
  const user = await prisma.user.upsert({
    where: { externalId: e2eExternalId },
    update: { locale: "en-CH" },
    create: { externalId: e2eExternalId, locale: "en-CH" },
    select: { id: true },
  });
  // Add books only for this worker; never run staging's destructive replacement
  // against the shared E2E database or other workers' fixtures.
  seeded = await prisma.$transaction(
    (tx) => insertSeedBooks(tx, generateStagingDataset(today), [user]),
    { timeout: 120_000 },
  );
  const bank = await prisma.account.findFirstOrThrow({
    where: {
      accountBookId: seededBook("household").id,
      name: "Everyday account CHF",
    },
    select: { id: true },
  });
  bankAccountId = bank.id;
});

test("synthetic household data supports reports and three years of history", async ({
  page,
}) => {
  // Cold three-year History computation and its large fixture are deliberately
  // heavier than ordinary page checks, especially with revision triggers.
  test.setTimeout(120_000);
  const household = seededBook("household");
  await page.goto(`/${household.id}/report?period=2026-10`);
  await expect(
    page.getByRole("heading", { name: "October 2026" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Contribution to Total Return" }),
  ).toBeVisible();
  await expect(page.getByTestId("period-breakdown-chart")).toBeVisible();
  await expect(
    page.getByText(
      /skipped because reference-currency balances were unavailable\./,
    ),
  ).toHaveCount(0);

  await page.goto(`/${household.id}/history?mode=year`);
  await expect(page.getByRole("heading", { name: "History" })).toBeVisible();
  await expect(page.locator(".ag-charts-wrapper canvas").first()).toBeVisible();
  await expect(page.getByText("No periods available yet.")).toHaveCount(0);
  await expect(
    page
      .getByRole("radiogroup", { name: "History Period Mode" })
      .getByRole("radio", { name: "Yearly" }),
  ).toBeChecked();
});

test("the managed portfolio separates cash flows from explicit statement gains and losses", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const household = seededBook("household");
  const portfolio = await prisma.account.findFirstOrThrow({
    where: { accountBookId: household.id, name: "Managed Portfolio CHF" },
  });
  const gainLoss = await prisma.account.findFirstOrThrow({
    where: { accountBookId: household.id, equityAccountSubtype: "GAIN_LOSS" },
  });
  await page.goto(`/${household.id}/accounts?tab=ASSET`);
  const investments = agGridRowByText(page, "Investments");
  await expect(investments).toBeVisible();
  const expander = investments.locator(".ag-group-contracted");
  if (await expander.isVisible()) await expander.click();
  await expect(
    agGridCellByColId(
      agGridRowByText(page, "Managed Portfolio CHF"),
      "assetClass",
    ),
  ).toHaveText("Other Assets");
  await page.goto(`/${household.id}/${portfolio.id}?period=2026-10`);
  await expect(
    page.getByTitle("Asset Class: Other Assets", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Managed Portfolio CHF", exact: true }),
  ).toBeVisible();
  await expect(
    agGridRowByText(page, "Managed portfolio: contribution"),
  ).toBeVisible();
  await expect(
    agGridCellByColId(
      agGridRowByText(page, "Managed portfolio: statement valuation"),
      "balance",
    ),
  ).toHaveText(/64[’']100\.00/);

  for (const [period, expectedGainLoss] of [
    ["2026-10", "600.00"],
    ["2023-11", "-350.00"],
  ]) {
    await page.goto(`/${household.id}/report?period=${period}`);
    await selectSegmentedControlOption(
      page.getByRole("radiogroup", { name: "Gains/Losses Chart Type" }),
      "Table",
    );
    const table = page.getByTestId("period-gains-losses-breakdown-table");
    await expect(table).toBeVisible();
    const portfolioRow = table
      .locator(".ag-grid-scrolling-container > .ag-row")
      .filter({ hasText: "Managed Portfolio CHF" });
    await expect(portfolioRow).toHaveCount(1);
    await expect(agGridCellByColId(portfolioRow, "totalGainLoss")).toHaveText(
      expectedGainLoss,
    );
    const explicitRow = table
      .locator(".ag-grid-scrolling-container > .ag-row")
      .filter({ hasText: "Explicit G/L" });
    await expect(agGridCellByColId(explicitRow, "totalGainLoss")).toHaveText(
      expectedGainLoss,
    );
    await portfolioRow.dblclick();
    await expect(page).toHaveURL(
      new RegExp(`/${household.id}/${gainLoss.id}\\?period=${period}$`),
    );
    await expect(
      agGridRowByText(page, "Managed portfolio: statement valuation"),
    ).toBeVisible();
  }
});

test("configured testers can switch to empty and valuation edge-case books", async ({
  page,
}) => {
  const household = seededBook("household");
  const empty = seededBook("empty");
  const edgeCases = seededBook("edge-cases");
  await page.goto(`/${household.id}/accounts?tab=ASSET&mode=active`);
  await page.getByRole("button", { name: household.name, exact: true }).click();
  await page.getByRole("menuitem", { name: empty.name, exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/${empty.id}/accounts\\?`));
  await expect(page.getByRole("heading", { name: "Accounts" })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Add Account", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: empty.name, exact: true }).click();
  await page
    .getByRole("menuitem", { name: edgeCases.name, exact: true })
    .click();
  await page.goto(`/${edgeCases.id}/accounts?tab=ASSET`);
  await expect(
    agGridCellByColId(
      agGridRowByText(page, "Unlisted investment (valuation unavailable)"),
      "assetClass",
    ),
  ).toHaveText("Alternative Investments");
  const unlisted = await prisma.account.findFirstOrThrow({
    where: {
      accountBookId: edgeCases.id,
      name: "Unlisted investment (valuation unavailable)",
    },
  });
  await page.goto(`/${edgeCases.id}/${unlisted.id}`);
  await expect(
    page.getByTitle("Asset Class: Alternative Investments", { exact: true }),
  ).toBeVisible();
  await page.goto(`/${edgeCases.id}/report?period=2026-10`);
  await expect(
    page.getByRole("heading", { name: "October 2026" }),
  ).toBeVisible();
  await expect(
    page.getByText(
      /skipped because reference-currency balances were unavailable\./,
    ),
  ).toBeVisible();
});

test("the seeded Bitcoin fee transfer preserves acquisition basis through a later sale", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const household = seededBook("household");
  const source = await prisma.account.findFirstOrThrow({
    where: { accountBookId: household.id, name: "Bitcoin transfer source" },
  });
  const destination = await prisma.account.findFirstOrThrow({
    where: {
      accountBookId: household.id,
      name: "Bitcoin transfer destination",
    },
  });
  await page.goto(`/${household.id}/${destination.id}`);
  await expect(
    page.getByTitle("Asset Class: Digital Assets", { exact: true }),
  ).toBeVisible();
  await expect(page.getByTestId("account-gain-loss-realised")).toContainText(
    "200.00",
    { timeout: 60_000 },
  );
  await page
    .getByRole("button", { name: "View Calculation", exact: true })
    .click();
  const calculation = page.getByRole("dialog", {
    name: "Gain/Loss Calculation",
    exact: true,
  });
  const openLots = calculation.getByRole("grid").nth(1);
  await expect(openLots.getByRole("row")).toHaveCount(2);
  const lot = openLots.getByRole("row").nth(1);
  // 0.0059 BTC at the original CHF 100,000/BTC basis leaves CHF 590 of cost.
  await expect(lot.getByRole("gridcell").nth(1)).toHaveText("0.00590");
  await expect(lot.getByRole("gridcell").nth(2)).toHaveText(/100[’']000/);
  await expect(lot.getByRole("gridcell").nth(0)).toHaveText(
    formatUtcDateForLocale(new Date("2026-09-19Z"), "en-CH"),
  );
  const sale = calculation
    .getByRole("row")
    .filter({ hasText: "Bitcoin transfer demo: partial sale" });
  await expect(sale.getByRole("gridcell").nth(3)).toHaveText("-0.00400");
  await expect(sale.getByRole("gridcell").nth(6)).toHaveText("200.00");

  await page.goto(`/${household.id}/${source.id}`);
  await page
    .getByRole("button", { name: "View Calculation", exact: true })
    .click();
  const sourceCalculation = page.getByRole("dialog", {
    name: "Gain/Loss Calculation",
    exact: true,
  });
  const fee = sourceCalculation
    .getByRole("row")
    .filter({ hasText: "Bitcoin transfer demo: transfer with network fee" });
  await expect(fee).toHaveCount(1);
  await expect(fee.getByRole("gridcell").nth(3)).toHaveText("-0.00010");
  const balance = await prisma.booking.aggregate({
    where: { accountBookId: household.id, accountId: source.id },
    _sum: { value: true },
  });
  expect(balance._sum.value!.toString()).toBe("0");
});

test("archived synthetic accounts remain available for archive workflows", async ({
  page,
}) => {
  await page.goto(
    `/${seededBook("household").id}/accounts?tab=ASSET&mode=archived`,
  );
  await expect(page.getByRole("heading", { name: "Accounts" })).toBeVisible();
  await agGridRowByText(page, "Zürcher Kantonalbank")
    .locator(".ag-group-contracted")
    .click();
  await expandArchivedGroups(page);
  await expect(agGridRowByText(page, "Closed bank account CHF")).toBeVisible();
  await expect(
    agGridCellByColId(
      agGridRowByText(page, "Closed bank account CHF"),
      "assetClass",
    ),
  ).toHaveText("Cash & Cash Equivalents");
  const archived = await prisma.account.findFirstOrThrow({
    where: {
      accountBookId: seededBook("household").id,
      name: "Closed bank account CHF",
    },
  });
  await page.goto(`/${seededBook("household").id}/${archived.id}`);
  await expect(
    page.getByTitle("Asset Class: Cash & Cash Equivalents", { exact: true }),
  ).toBeVisible();
});

test("archived seed hierarchies are available in Accounts and Categories", async ({
  page,
}) => {
  const id = seededBook("household").id;
  for (const [tab, groups, item] of [
    ["BALANCE", ["Zürcher Kantonalbank"], "Closed bank account CHF"],
    ["BALANCE", [], "Repaid car loan CHF"],
    ["EQUITY-INCOME", ["Consulting"], "One-off project"],
    ["EQUITY-EXPENSE", ["Car", "Running costs"], "Fuel"],
  ] as const) {
    const isCategory = tab.startsWith("EQUITY-");
    await page.goto(
      `/${id}/accounts?tab=${tab}${isCategory ? "&mode=archived" : ""}`,
    );
    if (groups[0] && !isCategory)
      await agGridRowByText(page, groups[0])
        .locator(".ag-group-contracted")
        .click();
    await expect(
      page.locator('[row-id^="__archived__:"]').first(),
    ).toBeVisible();
    await expandArchivedGroups(page);
    if (tab !== "BALANCE")
      for (const name of groups) {
        const group = agGridRowByText(page, name);
        await expect(group).toBeVisible();
        const expander = group.locator(".ag-group-contracted");
        if (await expander.isVisible()) await expander.click();
      }
    await expect(agGridRowByText(page, item)).toBeVisible();
    await expect(agGridRowByText(page, "Former bank accounts")).toHaveCount(0);
  }
});

test("closed seed investments retain realised gains and losses in collapsed unified totals", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const accountBookId = seededBook("household").id;
  await page.setViewportSize({ width: 1920, height: 1080 });
  const groups = await prisma.accountGroup.findMany({
    where: { accountBookId },
  });
  const investments = groups.find((group) => group.name === "Investments")!;
  const shares = groups.find((group) => group.name === "Shares")!;
  const portfolio = groups.find(
    (group) => group.name === "Credit Suisse portfolio",
  )!;
  const equities = groups.find(
    (group) => group.parentGroupId === portfolio.id,
  )!;
  const holdings = await prisma.account.findMany({
    where: { accountBookId, groupId: equities.id },
  });
  await page.goto(`/${accountBookId}/accounts?tab=ASSET`);
  const archive = page.locator(
    `[row-id="__archived__:group:${investments.id}"]`,
  );
  await expect(archive).toHaveAttribute("aria-expanded", "false");
  await expect(agGridCellByColId(archive, "realizedGainLoss")).toHaveText(
    "50.00",
    { timeout: 60_000 },
  );
  await expect(agGridCellByColId(archive, "unrealizedGainLoss")).toHaveText(
    "0.00",
  );
  await expect(agGridCellByColId(archive, "totalGainLoss")).toHaveText("50.00");
  await expect(
    agGridCellByColId(archive, "balanceInReferenceCurrency"),
  ).toHaveText("0.00");
  const parent = page.locator(`[row-id="${investments.id}"]`);
  const footer = agGridPinnedBottomRow(page);
  const fields = [
    "realizedGainLoss",
    "unrealizedGainLoss",
    "totalGainLoss",
    "balanceInReferenceCurrency",
  ];
  const before = await Promise.all(
    [parent, footer].flatMap((row) =>
      fields.map((field) => agGridCellByColId(row, field).innerText()),
    ),
  );
  await archive.locator(".ag-group-contracted").click();
  const portfolioRow = page.locator(`[row-id="${portfolio.id}"]`);
  await expect(agGridCellByColId(portfolioRow, "totalGainLoss")).toHaveText(
    "50.00",
  );
  await portfolioRow.locator(".ag-group-contracted").click();
  const equitiesRow = page.locator(`[row-id="${equities.id}"]`);
  await expect(agGridCellByColId(equitiesRow, "totalGainLoss")).toHaveText(
    "50.00",
  );
  await equitiesRow.locator(".ag-group-contracted").click();
  for (const [symbol, expected] of [
    ["AAPL", "150.00"],
    ["MSFT", "-100.00"],
  ]) {
    const row = page.locator(
      `[row-id="${holdings.find((holding) => holding.symbol === symbol)!.id}"]`,
    );
    await expect(agGridCellByColId(row, "realizedGainLoss")).toHaveText(
      expected,
    );
    await expect(agGridCellByColId(row, "unrealizedGainLoss")).toHaveText(
      "0.00",
    );
    await expect(agGridCellByColId(row, "totalGainLoss")).toHaveText(expected);
  }
  await page.locator(`[row-id="${shares.id}"] .ag-group-contracted`).click();
  const directArchive = page.locator(
    `[row-id="__archived__:group:${shares.id}"]`,
  );
  await expect(agGridCellByColId(directArchive, "totalGainLoss")).toHaveText(
    "20.00",
  );
  await directArchive.locator(".ag-group-contracted").click();
  await expect(
    agGridCellByColId(
      agGridRowByText(page, "Closed Apple position"),
      "totalGainLoss",
    ),
  ).toHaveText("20.00");
  const after = await Promise.all(
    [parent, footer].flatMap((row) =>
      fields.map((field) => agGridCellByColId(row, field).innerText()),
    ),
  );
  expect(after).toEqual(before);
  await archive.locator(".ag-group-expanded").click();
  const collapsed = await Promise.all(
    [parent, footer].flatMap((row) =>
      fields.map((field) => agGridCellByColId(row, field).innerText()),
    ),
  );
  expect(collapsed).toEqual(before);
});

test("the sample CSV imports into the configured synthetic bank account", async ({
  page,
}) => {
  const household = seededBook("household");
  await page.goto(`/${household.id}/${bankAccountId}/import-statement`);
  await expect(
    page.getByRole("heading", { name: "Import Statement" }),
  ).toBeVisible();
  await page.locator('input[type="file"]').setInputFiles({
    name: "synthetic-statement.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(generateStatementImportSample(today)),
  });
  await expect(page.getByText("0 of 3 ready")).toBeVisible();
  const descriptions = [
    "Demo statement groceries",
    "Demo statement restaurant abroad",
    "Demo statement refund",
  ];
  const counterAccounts = ["Groceries", "Travel", "Freelance income"];
  for (let rowIndex = 0; rowIndex < descriptions.length; rowIndex += 1) {
    await expect(agGridRowByText(page, descriptions[rowIndex])).toBeVisible();
    await setGridAccountTreeCellValue({
      root: page,
      rowIndex,
      colId: "counterAccountId",
      accountName: counterAccounts[rowIndex],
    });
  }
  await expect(page.getByText("3 of 3 ready")).toBeVisible();
  await page.getByRole("button", { name: "Import Transactions" }).click();
  await expect(page).toHaveURL(
    new RegExp(`/${household.id}/${bankAccountId}\\?`),
  );
  await expect(agGridRowByText(page, descriptions[0])).toBeVisible();
  expect(
    await prisma.transaction.count({
      where: { accountBookId: household.id, description: { in: descriptions } },
    }),
  ).toBe(3);
});
