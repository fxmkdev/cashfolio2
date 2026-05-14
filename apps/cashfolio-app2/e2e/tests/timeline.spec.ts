import { expect, test } from "@playwright/test";
import {
  seedDatabase,
  seedThreeBookingSplitTransaction,
  type SeededData,
} from "../support/db";
import { selectSegmentedControlOption } from "../support/segmented-control";

let seeded: SeededData;

test.beforeAll(async () => {
  seeded = await seedDatabase();
  await seedThreeBookingSplitTransaction({
    accountBookId: seeded.accountBookId,
    description: "E2E Timeline Expense Scope Seed",
    currentAccountId: seeded.cashAccount.id,
    debitAccountIds: [seeded.expenseAccount.id, seeded.expenseAccount.id],
  });
});

test("timeline page is reachable and persists selected period mode across refresh", async ({
  page,
}) => {
  await page.goto(`/${seeded.accountBookId}/accounts?tab=ASSET&mode=active`);
  await expect(page.getByRole("heading", { name: "Accounts" })).toBeVisible();

  await page.getByRole("link", { name: "Timeline" }).click();
  await expect(page).toHaveURL(
    new RegExp(`/${seeded.accountBookId}/timeline$`),
  );
  await expect(page.getByRole("heading", { name: "Timeline" })).toBeVisible();

  const periodModeControl = page.getByRole("radiogroup", {
    name: "Timeline Period Mode",
  });
  await selectSegmentedControlOption(periodModeControl, "Yearly");

  const chartCanvas = page.locator(".ag-charts-wrapper canvas").first();
  await expect(chartCanvas).toBeVisible();

  await page.reload();
  await expect(page.getByRole("heading", { name: "Timeline" })).toBeVisible();
  await expect(
    periodModeControl.getByRole("radio", { name: "Yearly" }),
  ).toBeChecked();

  await page
    .getByRole("navigation")
    .getByRole("link", { name: "Period" })
    .click();
  await expect(page).toHaveURL(new RegExp(`/${seeded.accountBookId}/period$`));
  await expect(page.getByRole("heading", { name: "Period" })).toBeVisible();
});

test("timeline mode toggles update URL mode and keep history compact", async ({
  page,
}) => {
  await page.goto(`/${seeded.accountBookId}/accounts?tab=ASSET&mode=active`);
  await expect(page.getByRole("heading", { name: "Accounts" })).toBeVisible();

  await page.getByRole("link", { name: "Timeline" }).click();
  await expect(page).toHaveURL(
    new RegExp(`/${seeded.accountBookId}/timeline$`),
  );

  const periodModeControl = page.getByRole("radiogroup", {
    name: "Timeline Period Mode",
  });

  await selectSegmentedControlOption(periodModeControl, "Yearly");
  await expect(
    periodModeControl.getByRole("radio", { name: "Yearly" }),
  ).toBeChecked();
  await expect
    .poll(() => new URL(page.url()).searchParams.get("mode"))
    .toBe("year");

  await selectSegmentedControlOption(periodModeControl, "Monthly");
  await expect(
    periodModeControl.getByRole("radio", { name: "Monthly" }),
  ).toBeChecked();
  await expect
    .poll(() => new URL(page.url()).searchParams.get("mode"))
    .toBeNull();

  await page.goBack();
  await expect(page).toHaveURL(
    new RegExp(`/${seeded.accountBookId}/accounts\\?tab=ASSET&mode=active$`),
  );
  await expect(page.getByRole("heading", { name: "Accounts" })).toBeVisible();
});

test("timeline deep link with yearly mode selects yearly on first load", async ({
  page,
}) => {
  await page.goto(`/${seeded.accountBookId}/timeline?mode=year`);
  await expect(page.getByRole("heading", { name: "Timeline" })).toBeVisible();

  const periodModeControl = page.getByRole("radiogroup", {
    name: "Timeline Period Mode",
  });
  await expect(
    periodModeControl.getByRole("radio", { name: "Yearly" }),
  ).toBeChecked();
  await expect
    .poll(() => new URL(page.url()).searchParams.get("mode"))
    .toBe("year");
});

test("timeline shows chart data for the account-book period range", async ({
  page,
}) => {
  await page.goto(`/${seeded.accountBookId}/timeline`);
  await expect(page.getByRole("heading", { name: "Timeline" })).toBeVisible();
  await expect(page.locator(".ag-charts-wrapper canvas").first()).toBeVisible();
  await expect(page.getByText("No periods available yet.")).toHaveCount(0);
});

test("timeline deep link with invalid mode falls back to monthly", async ({
  page,
}) => {
  await page.goto(`/${seeded.accountBookId}/timeline?mode=weekly`);
  await expect(page.getByRole("heading", { name: "Timeline" })).toBeVisible();

  const periodModeControl = page.getByRole("radiogroup", {
    name: "Timeline Period Mode",
  });
  await expect(
    periodModeControl.getByRole("radio", { name: "Monthly" }),
  ).toBeChecked();
  await expect(
    periodModeControl.getByRole("radio", { name: "Yearly" }),
  ).not.toBeChecked();
});

test("timeline expense scope tree select opens with hierarchical options and supports searchable selection", async ({
  page,
}) => {
  await page.goto(`/${seeded.accountBookId}/timeline`);
  await expect(page.getByRole("heading", { name: "Timeline" })).toBeVisible();

  await page.getByRole("combobox", { name: "View" }).click();
  await page.getByRole("option", { name: "Expenses", exact: true }).click();
  await expect
    .poll(() => new URL(page.url()).searchParams.get("metric"))
    .toBe("expenses");

  const scopeInput = page.getByLabel("Timeline Metric Scope");
  await expect(scopeInput).toHaveValue("Total");
  await scopeInput.click();

  await expect(
    page.getByRole("option", { name: "Total", exact: true }),
  ).toBeVisible();
  const equityGroupOption = page
    .getByRole("option")
    .filter({ hasText: /^Equity$/ });
  await expect(equityGroupOption).toBeVisible();
  await equityGroupOption.getByRole("button", { name: "Expand" }).click();

  const expenseGroupOption = page
    .getByRole("option")
    .filter({ hasText: /^E2E Expenses$/ });
  await expect(expenseGroupOption).toBeVisible();
  await expenseGroupOption.getByRole("button", { name: "Expand" }).click();

  const expenseAccountOption = page.getByRole("option", {
    name: "E2E Expense",
    exact: true,
  });
  await expect(expenseAccountOption).toBeVisible();

  await scopeInput.fill("E2E Expense");
  await expect(expenseAccountOption).toBeVisible();
  await expenseAccountOption.click();

  await expect(scopeInput).toHaveValue("E2E Expense");
  await expect
    .poll(() => new URL(page.url()).searchParams.get("expenseScope"))
    .toBe(`account:${seeded.expenseAccount.id}`);

  await scopeInput.click();
  await scopeInput.fill("uncommitted scope text");
  await page.getByRole("heading", { name: "Timeline" }).click();
  await expect(scopeInput).toHaveValue("E2E Expense");

  await scopeInput.click();
  await page.getByRole("option", { name: "Total", exact: true }).click();
  await expect(scopeInput).toHaveValue("Total");
  await expect
    .poll(() => new URL(page.url()).searchParams.get("expenseScope"))
    .toBeNull();
});
