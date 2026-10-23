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
import { agGridRowByText, setGridAccountTreeCellValue } from "../support/grid";
import { assertSafeWriteTarget, prisma } from "../support/db-client";
import { expect, test } from "../support/fixtures";

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
  await expandArchivedGroups(page);
  await agGridRowByText(page, "Former bank accounts")
    .locator(".ag-group-contracted")
    .click();
  await expect(agGridRowByText(page, "Closed bank account CHF")).toBeVisible();
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
