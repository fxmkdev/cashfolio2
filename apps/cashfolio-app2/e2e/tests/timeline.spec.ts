import { expect, test } from "@playwright/test";
import {
  seedDatabase,
  seedExpenseScopeOverflowOptions,
  seedThreeBookingSplitTransaction,
  type SeededData,
} from "../support/db";
import { selectSegmentedControlOption } from "../support/segmented-control";

let seeded: SeededData;
let overflowExpenseScopeTarget: {
  id: string;
  label: string;
  name: string;
};

test.beforeAll(async () => {
  seeded = await seedDatabase();
  await seedThreeBookingSplitTransaction({
    accountBookId: seeded.accountBookId,
    description: "E2E Timeline Expense Scope Seed",
    currentAccountId: seeded.cashAccount.id,
    debitAccountIds: [seeded.expenseAccount.id, seeded.expenseAccount.id],
  });
  const overflowOptions = await seedExpenseScopeOverflowOptions({
    accountBookId: seeded.accountBookId,
    currentAccountId: seeded.cashAccount.id,
    expenseGroupId: seeded.expenseGroupId,
  });
  overflowExpenseScopeTarget = overflowOptions.targetAccount;
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
    name: "Timeline period mode",
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
    name: "Timeline period mode",
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
    name: "Timeline period mode",
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
    name: "Timeline period mode",
  });
  await expect(
    periodModeControl.getByRole("radio", { name: "Monthly" }),
  ).toBeChecked();
  await expect(
    periodModeControl.getByRole("radio", { name: "Yearly" }),
  ).not.toBeChecked();
});

test("timeline expense scope combobox opens with all options and supports searchable selection", async ({
  page,
}) => {
  await page.goto(`/${seeded.accountBookId}/timeline`);
  await expect(page.getByRole("heading", { name: "Timeline" })).toBeVisible();

  await page.getByRole("combobox", { name: "View" }).click();
  await page.getByRole("option", { name: "Expenses", exact: true }).click();
  await expect
    .poll(() => new URL(page.url()).searchParams.get("metric"))
    .toBe("expenses");

  const scopeInput = page.getByLabel("Timeline metric scope");
  await expect(scopeInput).toHaveValue("Total");
  await scopeInput.click();

  await expect(
    page.getByRole("option", { name: "Total", exact: true }),
  ).toBeVisible();
  const expenseAccountOption = page.getByRole("option", {
    name: "Equity / E2E Expenses / E2E Expense",
    exact: true,
  });
  await expect(expenseAccountOption).toBeVisible();

  await scopeInput.fill("E2E Expense");
  await expect(expenseAccountOption).toBeVisible();
  await expenseAccountOption.click();

  await expect(scopeInput).toHaveValue("Equity / E2E Expenses / E2E Expense");
  await expect
    .poll(() => new URL(page.url()).searchParams.get("expenseScope"))
    .toBe(`account:${seeded.expenseAccount.id}`);

  await scopeInput.click();
  await scopeInput.fill("uncommitted scope text");
  await page.getByRole("heading", { name: "Timeline" }).click();
  await expect(scopeInput).toHaveValue("Equity / E2E Expenses / E2E Expense");

  await scopeInput.click();
  await page.getByRole("option", { name: "Total", exact: true }).click();
  await expect(scopeInput).toHaveValue("Total");
  await expect
    .poll(() => new URL(page.url()).searchParams.get("expenseScope"))
    .toBeNull();
});

test("timeline expense scope combobox scrolls through long option lists", async ({
  page,
}) => {
  await page.goto(`/${seeded.accountBookId}/timeline`);
  await expect(page.getByRole("heading", { name: "Timeline" })).toBeVisible();

  await page.getByRole("combobox", { name: "View" }).click();
  await page.getByRole("option", { name: "Expenses", exact: true }).click();
  await expect
    .poll(() => new URL(page.url()).searchParams.get("metric"))
    .toBe("expenses");

  const scopeInput = page.getByLabel("Timeline metric scope");
  await scopeInput.click();

  const scopeOptionsViewport = page.getByTestId(
    "timeline-scope-options-viewport",
  );
  await expect(scopeOptionsViewport).toBeVisible();
  await expect
    .poll(() =>
      scopeOptionsViewport.evaluate((element) => ({
        isConstrained: element.clientHeight <= 260,
        isScrollable: element.scrollHeight > element.clientHeight,
      })),
    )
    .toMatchObject({
      isConstrained: true,
      isScrollable: true,
    });

  await scopeOptionsViewport.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });

  const overflowExpenseOption = page.getByRole("option", {
    name: overflowExpenseScopeTarget.label,
    exact: true,
  });
  await expect(overflowExpenseOption).toBeVisible();
  await overflowExpenseOption.click();

  await expect(scopeInput).toHaveValue(overflowExpenseScopeTarget.label);
  await expect
    .poll(() => new URL(page.url()).searchParams.get("expenseScope"))
    .toBe(`account:${overflowExpenseScopeTarget.id}`);
});
