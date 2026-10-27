import {
  seedDatabase,
  seedThreeBookingSplitTransaction,
  type SeededData,
} from "../support/db";
import { expect, test } from "../support/fixtures";
import { selectSegmentedControlOption } from "../support/segmented-control";

let seeded: SeededData;

test.beforeAll(async ({ e2eExternalId }) => {
  seeded = await seedDatabase({ userExternalId: e2eExternalId });
  // Spending without an opening balance leaves Cash overdrawn; Net Worth
  // account history must preserve that negative balance.
  await seedThreeBookingSplitTransaction({
    accountBookId: seeded.accountBookId,
    description: "E2E History Expense Scope Seed",
    currentAccountId: seeded.cashAccount.id,
    debitAccountIds: [seeded.expenseAccount.id, seeded.expenseAccount.id],
  });
});

test("history page is reachable and persists selected period mode across refresh", async ({
  page,
}) => {
  await page.goto(`/${seeded.accountBookId}/accounts?tab=BALANCE&mode=active`);
  await expect(page.getByRole("heading", { name: "Accounts" })).toBeVisible();

  await page.getByRole("link", { name: "History" }).click();
  await expect(page).toHaveURL(new RegExp(`/${seeded.accountBookId}/history$`));
  await expect(page.getByRole("heading", { name: "History" })).toBeVisible();

  const periodModeControl = page.getByRole("radiogroup", {
    name: "History Period Mode",
  });
  await selectSegmentedControlOption(periodModeControl, "Yearly");

  const chartCanvas = page.locator(".ag-charts-wrapper canvas").first();
  await expect(chartCanvas).toBeVisible();

  await page.reload();
  await expect(page.getByRole("heading", { name: "History" })).toBeVisible();
  await expect(
    periodModeControl.getByRole("radio", { name: "Yearly" }),
  ).toBeChecked();

  await page
    .getByRole("navigation")
    .getByRole("link", { name: "Report" })
    .click();
  await expect(page).toHaveURL(new RegExp(`/${seeded.accountBookId}/report$`));
  await expect(page.getByTestId("period-picker-trigger")).toBeVisible();
});

test("history mode toggles update URL mode and keep history compact", async ({
  page,
}) => {
  await page.goto(`/${seeded.accountBookId}/accounts?tab=BALANCE&mode=active`);
  await expect(page.getByRole("heading", { name: "Accounts" })).toBeVisible();

  await page.getByRole("link", { name: "History" }).click();
  await expect(page).toHaveURL(new RegExp(`/${seeded.accountBookId}/history$`));

  const periodModeControl = page.getByRole("radiogroup", {
    name: "History Period Mode",
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
    new RegExp(`/${seeded.accountBookId}/accounts\\?tab=BALANCE&mode=active$`),
  );
  await expect(page.getByRole("heading", { name: "Accounts" })).toBeVisible();
});

test("history deep link with yearly mode selects yearly on first load", async ({
  page,
}) => {
  await page.goto(`/${seeded.accountBookId}/history?mode=year`);
  await expect(page.getByRole("heading", { name: "History" })).toBeVisible();

  const periodModeControl = page.getByRole("radiogroup", {
    name: "History Period Mode",
  });
  await expect(
    periodModeControl.getByRole("radio", { name: "Yearly" }),
  ).toBeChecked();
  await expect
    .poll(() => new URL(page.url()).searchParams.get("mode"))
    .toBe("year");
});

test("history shows chart data for the account-book period range", async ({
  page,
}) => {
  await page.goto(`/${seeded.accountBookId}/history`);
  await expect(page.getByRole("heading", { name: "History" })).toBeVisible();
  await expect(page.locator(".ag-charts-wrapper canvas").first()).toBeVisible();
  await expect(page.getByText("No periods available yet.")).toHaveCount(0);
});

test("history deep link with invalid mode falls back to monthly", async ({
  page,
}) => {
  await page.goto(`/${seeded.accountBookId}/history?mode=weekly`);
  await expect(page.getByRole("heading", { name: "History" })).toBeVisible();

  const periodModeControl = page.getByRole("radiogroup", {
    name: "History Period Mode",
  });
  await expect(
    periodModeControl.getByRole("radio", { name: "Monthly" }),
  ).toBeChecked();
  await expect(
    periodModeControl.getByRole("radio", { name: "Yearly" }),
  ).not.toBeChecked();
});

test("history view tree selects roots, groups and accounts and supports search", async ({
  page,
}) => {
  await page.goto(`/${seeded.accountBookId}/history?mode=year`);
  await expect(page.getByRole("heading", { name: "History" })).toBeVisible();

  const viewInput = page.getByRole("textbox", { name: "View" });
  await expect(page.getByRole("textbox")).toHaveCount(1);
  await expect(viewInput).toHaveValue("Total Return");
  await viewInput.click();
  await expect(
    page.getByRole("option", { name: "Total", exact: true }),
  ).toHaveCount(0);
  const expensesRoot = page
    .getByRole("option")
    .filter({ hasText: /^Expenses$/ });
  await expensesRoot.click();
  await expect(viewInput).toHaveValue("Expenses");
  await expect
    .poll(() => new URL(page.url()).searchParams.get("metric"))
    .toBe("expenses");

  await viewInput.click();
  await expensesRoot.getByRole("button", { name: "Expand" }).click();
  const equityGroup = page.getByRole("option").filter({ hasText: /^Equity$/ });
  await equityGroup.getByRole("button", { name: "Expand" }).click();
  const expenseGroup = page
    .getByRole("option")
    .filter({ hasText: /^E2E Expenses$/ });
  await expenseGroup.click();
  await expect(viewInput).toHaveValue("E2E Expenses");
  await expect
    .poll(() => new URL(page.url()).searchParams.get("expenseScope"))
    .toBe(`group:${seeded.expenseGroupId}`);

  await viewInput.click();
  // The input label changes optimistically; the selected option confirms the new scope has loaded.
  await expect(expenseGroup).toHaveAttribute("aria-selected", "true");
  await viewInput.fill("Expenses / Equity / E2E Expenses / E2E Expense");
  await page.getByRole("option", { name: "E2E Expense", exact: true }).click();
  await expect(viewInput).toHaveValue("E2E Expense");
  await expect
    .poll(() => new URL(page.url()).searchParams.get("expenseScope"))
    .toBe(`account:${seeded.expenseAccount.id}`);

  await viewInput.click();
  await viewInput.fill("uncommitted view text");
  await page.getByRole("heading", { name: "History" }).click();
  await expect(viewInput).toHaveValue("E2E Expense");
  await page.reload();
  await expect(viewInput).toHaveValue("E2E Expense");
  await expect(page.getByRole("radio", { name: "Yearly" })).toBeChecked();

  await viewInput.click();
  await expensesRoot.click();
  await expect(viewInput).toHaveValue("Expenses");
  await expect
    .poll(() => new URL(page.url()).searchParams.get("expenseScope"))
    .toBeNull();
  await expect
    .poll(() => new URL(page.url()).searchParams.get("mode"))
    .toBe("year");
});

test("history view search waits for a pending scope selection to commit", async ({
  page,
}) => {
  await page.goto(`/${seeded.accountBookId}/accounts?tab=BALANCE&mode=active`);
  await expect(page.getByRole("heading", { name: "Accounts" })).toBeVisible();
  await page.goto(
    `/${seeded.accountBookId}/history?mode=year&metric=expenses&netWorthScope=account:${seeded.cashAccount.id}`,
  );
  const viewInput = page.getByRole("textbox", { name: "View" });
  await expect(viewInput).toHaveValue("Expenses");
  await expect(viewInput).toBeEnabled();

  let releaseResponse = () => {};
  const responseGate = new Promise<void>((resolve) => {
    releaseResponse = resolve;
  });
  let markResponseReady = () => {};
  const responseReady = new Promise<void>((resolve) => {
    markResponseReady = resolve;
  });
  let holdNextResponse = true;
  await page.route("**/_serverFn/**", async (route) => {
    if (!holdNextResponse || route.request().method() !== "GET") {
      await route.continue();
      return;
    }
    holdNextResponse = false;
    const response = await route.fetch();
    markResponseReady();
    await responseGate;
    await route.fulfill({ response });
  });

  try {
    await viewInput.click();
    await viewInput.fill("Expenses / Equity / E2E Expenses");
    await page
      .getByRole("option")
      .filter({ hasText: /^E2E Expenses$/ })
      .click();
    await responseReady;
    await expect(viewInput).toBeDisabled();
  } finally {
    releaseResponse();
  }

  await expect(viewInput).toBeEnabled();
  await expect(viewInput).toHaveValue("E2E Expenses");
  await viewInput.click();
  await viewInput.fill("Expenses / Equity / E2E Expenses / E2E Expense");
  await page.getByRole("option", { name: "E2E Expense", exact: true }).click();
  await expect(viewInput).toBeEnabled();
  await expect(viewInput).toHaveValue("E2E Expense");
  await expect
    .poll(() => new URL(page.url()).searchParams.get("expenseScope"))
    .toBe(`account:${seeded.expenseAccount.id}`);
  expect(new URL(page.url()).searchParams.get("netWorthScope")).toBe(
    `account:${seeded.cashAccount.id}`,
  );

  await page.reload();
  await expect(viewInput).toHaveValue("E2E Expense");
  await expect(viewInput).toBeEnabled();
  await page.goBack();
  await expect(page.getByRole("heading", { name: "Accounts" })).toBeVisible();
  await page.goForward();
  await expect(viewInput).toHaveValue("E2E Expense");
  await expect(viewInput).toBeEnabled();
});

test("history view tree switches metric and account together and retains other saved scopes", async ({
  page,
}) => {
  await page.goto(
    `/${seeded.accountBookId}/history?mode=year&metric=expenses&expenseScope=account:${seeded.expenseAccount.id}`,
  );
  const viewInput = page.getByRole("textbox", { name: "View" });
  await expect(viewInput).toHaveValue(seeded.expenseAccount.name);
  await viewInput.click();
  await viewInput.fill(`Net Worth / Assets / ${seeded.cashAccount.name}`);
  const cashOption = page.getByRole("option", {
    name: seeded.cashAccount.name,
    exact: true,
  });
  await cashOption.click();
  await expect
    .poll(() => ({
      metric: new URL(page.url()).searchParams.get("metric"),
      netWorthScope: new URL(page.url()).searchParams.get("netWorthScope"),
    }))
    .toEqual({
      metric: "netWorth",
      netWorthScope: `account:${seeded.cashAccount.id}`,
    });
  await expect(viewInput).toHaveValue(seeded.cashAccount.name);
  expect(new URL(page.url()).searchParams.get("expenseScope")).toBe(
    `account:${seeded.expenseAccount.id}`,
  );
  expect(new URL(page.url()).searchParams.get("mode")).toBe("year");
  await page.reload();
  await expect(viewInput).toHaveValue(seeded.cashAccount.name);

  await viewInput.click();
  await viewInput.fill("Assets");
  const assetsRoot = page
    .getByRole("option")
    .filter({ hasText: /^Assets$/ })
    .first();
  await expect(assetsRoot.getByRole("button", { name: "Expand" })).toHaveCount(
    0,
  );
  await assetsRoot.click();
  await expect(viewInput).toHaveValue("Assets");
  await expect
    .poll(() => new URL(page.url()).searchParams.get("metric"))
    .toBe("assets");
  expect(new URL(page.url()).searchParams.get("netWorthScope")).toBe(
    `account:${seeded.cashAccount.id}`,
  );

  await viewInput.click();
  await viewInput.fill("Liabilities");
  const liabilitiesRoot = page
    .getByRole("option")
    .filter({ hasText: /^Liabilities$/ })
    .first();
  await expect(
    liabilitiesRoot.getByRole("button", { name: "Expand" }),
  ).toHaveCount(0);
  await liabilitiesRoot.click();
  await expect(viewInput).toHaveValue("Liabilities");
  await expect
    .poll(() => new URL(page.url()).searchParams.get("metric"))
    .toBe("liabilities");
  expect(new URL(page.url()).searchParams.get("netWorthScope")).toBe(
    `account:${seeded.cashAccount.id}`,
  );

  await viewInput.click();
  await viewInput.fill("Net Worth");
  await page.getByRole("option", { name: "Net Worth", exact: true }).click();
  await expect(viewInput).toHaveValue("Net Worth");
  await expect
    .poll(() => new URL(page.url()).searchParams.get("metric"))
    .toBe("netWorth");
  await expect
    .poll(() => new URL(page.url()).searchParams.get("netWorthScope"))
    .toBeNull();
  expect(new URL(page.url()).searchParams.get("expenseScope")).toBe(
    `account:${seeded.expenseAccount.id}`,
  );
});
