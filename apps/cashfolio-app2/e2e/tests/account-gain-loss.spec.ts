import { expandArchivedGroups } from "../support/grid";
import { createId } from "@paralleldrive/cuid2";
import { expect, test } from "../support/fixtures";
import { seedDatabase } from "../support/db";
import { prisma } from "../support/db-client";
import { openEditTransaction } from "../support/transaction-form";
import { seedAccountGainLoss } from "../support/account-gain-loss-seeds";
import {
  agGridCellByColId,
  agGridRowByText,
  agGridPinnedBottomRow,
  setGridCellValue,
} from "../support/grid";

test("ledger excludes reference-currency accounts before requesting G/L and preserves eligible loading", async ({
  page,
  e2eExternalId,
}) => {
  const book = await seedDatabase({
    userExternalId: e2eExternalId,
    accountBookStartDate: new Date("2026-01-01Z"),
  });
  const { destination } = await seedAccountGainLoss(
    book.accountBookId,
    book.cashAccount.id,
  );
  const liability = await prisma.account.create({
    data: {
      id: createId(),
      accountBookId: book.accountBookId,
      name: "Reference-currency liability",
      type: "LIABILITY",
      unit: "CURRENCY",
      currency: "CHF",
    },
  });

  const summaryResponse = page.waitForResponse(async (response) => {
    if (!response.url().includes("/_serverFn/")) return false;
    const body = await response.text().catch(() => "");
    return (
      body.includes("realizedGainLoss") &&
      body.includes("accountName") &&
      body.includes(destination.name)
    );
  });
  await page.goto(`/${book.accountBookId}/${destination.id}`);
  const endpoint = (await summaryResponse).url().split("?")[0];
  await expect(page.getByTestId("account-gain-loss-total")).toBeVisible();

  let requests = 0;
  let releaseResponse!: () => void;
  const responseGate = new Promise<void>((resolve) => {
    releaseResponse = resolve;
  });
  const pattern = `${endpoint}*`;
  await page.route(pattern, async (route) => {
    requests += 1;
    await responseGate;
    await route.continue();
  });

  try {
    for (const account of [book.cashAccount, liability, book.expenseAccount]) {
      await page.goto(`/${book.accountBookId}/${account.id}`);
      await expect(
        page.getByRole("heading", { name: account.name, exact: true }),
      ).toBeVisible();
      await page.waitForLoadState("networkidle");
      await expect(
        page.getByRole("heading", { name: "G/L Since Start", exact: true }),
      ).toHaveCount(0);
      await expect(
        page.getByLabel("Loading gain/loss", { exact: true }),
      ).toHaveCount(0);
      expect(requests).toBe(0);
    }

    await page.goto(`/${book.accountBookId}/${destination.id}`);
    await expect.poll(() => requests).toBe(1);
    await expect(
      page.getByRole("heading", { name: "G/L Since Start", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByLabel("Loading gain/loss", { exact: true }),
    ).toBeVisible();
  } finally {
    releaseResponse();
  }
  await expect(page.getByTestId("account-gain-loss-total")).toBeVisible();
  await page.unroute(pattern);
});

test("accumulated account G/L, nested totals, historical summary, and FIFO explanation", async ({
  page,
  e2eExternalId,
}) => {
  const book = await seedDatabase({
    userExternalId: e2eExternalId,
    accountBookStartDate: new Date("2026-01-01Z"),
  });
  const { source, destination } = await seedAccountGainLoss(
    book.accountBookId,
    book.cashAccount.id,
  );
  await page.goto(`/${book.accountBookId}/accounts`);
  const gainLossHeader = page.getByRole("columnheader", {
    name: /G\/L Since Start \(CHF\)/,
  });
  await expect(gainLossHeader).toBeVisible();
  await expect(gainLossHeader).not.toContainText("1/1/2026");
  await expect(
    agGridCellByColId(agGridPinnedBottomRow(page), "totalGainLoss"),
  ).toHaveText("27.00");
  await gainLossHeader
    .getByRole("button", { name: "Show Gain/Loss Details" })
    .click();
  const details = page.getByRole("dialog", { name: "Gain/Loss Details" });
  await expect(details).toContainText("Since 1/1/2026 · As of");
  await expect(details).toContainText(
    "Totals include active and archived accounts",
  );
  await page.keyboard.press("Escape");
  await expect(details).not.toBeVisible();
  const row = agGridRowByText(page, destination.name);
  // Expand the tree path before inspecting the holding's cells.
  for (const name of ["Assets", "G/L Portfolio", "G/L Holdings"]) {
    const groupRow = agGridRowByText(page, name);
    await expect(groupRow).toBeVisible();
    const expand = groupRow.locator(".ag-group-contracted");
    if (await expand.isVisible()) await expand.click();
    await expect(groupRow).toHaveAttribute("aria-expanded", "true");
  }
  await expect(agGridCellByColId(row, "realizedGainLoss")).toHaveText("13.00");
  await expect(agGridCellByColId(row, "unrealizedGainLoss")).toHaveText("8.00");
  await expect(agGridCellByColId(row, "totalGainLoss")).toHaveText("21.00");
  for (const name of ["G/L Holdings", "G/L Portfolio"])
    await expect(
      agGridCellByColId(agGridRowByText(page, name), "totalGainLoss"),
    ).toHaveText("27.00");
  await row.dblclick();
  // Each figure has the same currency/text shape; stable IDs disambiguate the three summary values.
  await expect(page.getByTestId("account-gain-loss-realised")).toContainText(
    "13.00",
  );
  await page
    .getByRole("button", { name: "View Calculation", exact: true })
    .click();
  const calculation = page.getByRole("dialog", {
    name: "Gain/Loss Calculation",
    exact: true,
  });
  await expect(
    calculation.getByRole("heading", { name: "Unrealised Open Lots" }),
  ).toBeVisible();
  await calculation.getByText("Partial Sale", { exact: true }).click();
  const event = page.getByRole("dialog", { name: "Explain Realised Delta" });
  await expect(event.getByText("Lot Matches", { exact: true })).toBeVisible();
  await expect(event).toContainText("2.00000");
  await page.goto(`/${book.accountBookId}/${destination.id}?period=2026-02`);
  await expect(page.getByTestId("account-gain-loss-realised")).toContainText(
    "0.00",
  );
  await expect(page.getByTestId("account-gain-loss-unrealised")).toContainText(
    "16.00",
  );
  await expect(page.getByText(/Since .*As of .*28/)).toBeVisible();
  await page.goto(`/${book.accountBookId}/accounts?mode=archived`);
  const archived = agGridRowByText(page, source.name);
  for (const name of ["Assets", "G/L Portfolio", "G/L Holdings"]) {
    const groupRow = agGridRowByText(page, name);
    await expect(groupRow).toBeVisible();
    const expand = groupRow.locator(".ag-group-contracted");
    if (await expand.isVisible()) await expand.click();
    await expect(groupRow).toHaveAttribute("aria-expanded", "true");
  }
  await expandArchivedGroups(page);
  await expect(agGridCellByColId(archived, "totalGainLoss")).toHaveText("6.00");
  await expect(agGridCellByColId(archived, "realizedGainLoss")).toHaveText(
    "6.00",
  );
  await expect(agGridCellByColId(archived, "unrealizedGainLoss")).toHaveText(
    "0.00",
  );
  await expect(
    agGridCellByColId(agGridPinnedBottomRow(page), "totalGainLoss"),
  ).toHaveText("27.00");
});

test("a three-booking transfer realises only the holding spent on fees", async ({
  page,
  e2eExternalId,
}) => {
  const book = await seedDatabase({
    userExternalId: e2eExternalId,
    accountBookStartDate: new Date("2026-01-01Z"),
  });
  const { source, destination } = await seedAccountGainLoss(
    book.accountBookId,
    book.cashAccount.id,
    "fee",
  );
  await page.goto(`/${book.accountBookId}/${source.id}?period=2026-02`);
  await expect(page.getByTestId("account-gain-loss-realised")).toContainText(
    "8.00",
  );
  await expect(page.getByTestId("account-gain-loss-unrealised")).toContainText(
    "0.00",
  );
  await page
    .getByRole("button", { name: "View Calculation", exact: true })
    .click();
  const calculation = page.getByRole("dialog", {
    name: "Gain/Loss Calculation",
    exact: true,
  });
  const disposal = calculation
    .locator(".ag-row")
    .filter({ hasText: "Transfer Holding" });
  await expect(disposal).toHaveCount(1);
  await expect(agGridCellByColId(disposal, "quantity")).toHaveText("-1");
  await expect(agGridCellByColId(disposal, "realizedGainLossDelta")).toHaveText(
    "8.00",
  );
  await page.goto(`/${book.accountBookId}/${destination.id}?period=2026-02`);
  await expect(page.getByTestId("account-gain-loss-realised")).toContainText(
    "0.00",
  );
  await expect(page.getByTestId("account-gain-loss-unrealised")).toContainText(
    "16.00",
  );
});

test("opening a calculation event in the ledger closes the drawer and clears the period filter", async ({
  page,
  e2eExternalId,
}) => {
  const book = await seedDatabase({
    userExternalId: e2eExternalId,
    accountBookStartDate: new Date("2026-01-01Z"),
  });
  const { destination } = await seedAccountGainLoss(
    book.accountBookId,
    book.cashAccount.id,
  );
  await page.goto(`/${book.accountBookId}/${destination.id}?period=2026-03`);
  await page
    .getByRole("button", { name: "View Calculation", exact: true })
    .click();
  const calculation = page.getByRole("dialog", {
    name: "Gain/Loss Calculation",
    exact: true,
  });
  const sale = calculation
    .locator(".ag-row")
    .filter({ hasText: "Partial Sale" });
  await sale.hover();
  await sale
    .getByRole("button", { name: "Open in Ledger", exact: true })
    .click();
  await expect(calculation).not.toBeVisible();
  // The ledger consumes transactionId after scrolling, so assert the lasting scope change.
  await expect(page).toHaveURL((url) => !url.searchParams.has("period"));
  await expect(agGridRowByText(page, "Partial Sale")).toBeInViewport();
  // Closing the calculation must not prevent inspecting it again on the same route.
  await page
    .getByRole("button", { name: "View Calculation", exact: true })
    .click();
  await expect(calculation).toBeVisible();
});

test("transfers close opposite positions and explain their realised gain without open lots", async ({
  page,
  e2eExternalId,
}) => {
  const book = await seedDatabase({
    userExternalId: e2eExternalId,
    accountBookStartDate: new Date("2026-01-01Z"),
  });
  const { destination } = await seedAccountGainLoss(
    book.accountBookId,
    book.cashAccount.id,
    "opposite",
  );
  await page.goto(`/${book.accountBookId}/${destination.id}?period=2026-01`);
  await expect(page.getByTestId("account-gain-loss-realised")).toContainText(
    "110.00",
  );
  await expect(page.getByTestId("account-gain-loss-unrealised")).toContainText(
    "0.00",
  );
  await expect(page.getByTestId("account-gain-loss-total")).toContainText(
    "110.00",
  );
  await page
    .getByRole("button", { name: "View Calculation", exact: true })
    .click();
  const calculation = page.getByRole("dialog", {
    name: "Gain/Loss Calculation",
    exact: true,
  });
  await expect(
    calculation.getByText("No rows to show", { exact: true }),
  ).toBeVisible();
  const transfer = calculation
    .locator(".ag-row")
    .filter({ hasText: "Transfer Holding" });
  await expect(transfer.getByText("Transfer", { exact: true })).toBeVisible();
  await expect(agGridCellByColId(transfer, "realizedGainLossDelta")).toHaveText(
    "50.00",
  );
  await transfer.getByText("Transfer Holding", { exact: true }).click();
  const event = page.getByRole("dialog", { name: "Explain Realised Delta" });
  await expect(
    event.getByText("Transfer Basis", { exact: true }),
  ).toBeVisible();
  await expect(event.getByText(/carried acquisition costs/)).toBeVisible();
  await expect(event).toContainText("100.00000");
  await expect(event).toContainText("150.00000");
  await event.locator(".mantine-Drawer-close").click();
  await expect(event).not.toBeVisible();
  await transfer.hover();
  await transfer
    .getByRole("button", { name: "Open in Ledger", exact: true })
    .click();
  await expect(calculation).not.toBeVisible();
  await expect(page).toHaveURL((url) => !url.searchParams.has("period"));
  await expect(agGridRowByText(page, "Transfer Holding")).toBeInViewport();
});

test("G/L request failure can be retried without blocking the accounts page", async ({
  page,
  e2eExternalId,
}) => {
  const book = await seedDatabase({ userExternalId: e2eExternalId });
  let endpoint: string | undefined;
  page.on("response", async (response) => {
    if (!response.url().includes("/_serverFn/")) return;
    const body = await response.text().catch(() => "");
    if (body.includes("realizedGainLoss") && body.includes("totalGainLoss"))
      endpoint = response.url().split("?")[0];
  });
  await page.goto(`/${book.accountBookId}/accounts`);
  await expect.poll(() => endpoint).toBeTruthy();
  const pattern = `${endpoint}*`;
  let releaseFailure!: () => void;
  const failure = new Promise<void>((resolve) => {
    releaseFailure = resolve;
  });
  await page.route(pattern, async (route) => {
    await failure;
    await route.abort();
  });
  await page.getByRole("tab", { name: "Liabilities", exact: true }).click();
  await expect(page.locator(".mantine-Loader-root").first()).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Accounts", exact: true }),
  ).toBeVisible();
  releaseFailure();
  await expect(
    page.getByText("Gain/loss could not be loaded. Please try again."),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Accounts", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Show Gain/Loss Details" }).click();
  const details = page.getByRole("dialog", { name: "Gain/Loss Details" });
  await expect(
    details.getByText("Dates unavailable", { exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await page.unroute(pattern);
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(
    page.getByText("Gain/loss could not be loaded. Please try again."),
  ).not.toBeVisible();
  await expect(
    page.locator('.ag-cell[col-id="totalGainLoss"] .mantine-Loader-root'),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Show Gain/Loss Details" }).click();
  await expect(details).toContainText(/Since .+ · As of/);
  await page.keyboard.press("Escape");
});

test("ledger G/L refreshes after editing execution proceeds", async ({
  page,
  e2eExternalId,
}) => {
  const book = await seedDatabase({
    userExternalId: e2eExternalId,
    accountBookStartDate: new Date("2026-01-01Z"),
  });
  const { destination } = await seedAccountGainLoss(
    book.accountBookId,
    book.cashAccount.id,
  );
  await page.goto(`/${book.accountBookId}/${destination.id}`);
  await expect(page.getByTestId("account-gain-loss-realised")).toContainText(
    "13.00",
  );
  await openEditTransaction(page, "Partial Sale");
  const dialog = page.getByRole("dialog", { name: "Edit Transaction" });
  const cashRow = dialog
    .locator(".ag-grid-scrolling-container > .ag-row")
    .filter({ hasText: book.cashAccount.name })
    .first();
  const rowIndex = Number(await cashRow.getAttribute("row-index"));
  await setGridCellValue(dialog, rowIndex, "debit", "20");
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByTestId("account-gain-loss-realised")).toContainText(
    "18.00",
  );
  await expect(page.getByTestId("account-gain-loss-unrealised")).toContainText(
    "8.00",
  );
  await expect(page.getByTestId("account-gain-loss-total")).toContainText(
    "26.00",
  );
});
