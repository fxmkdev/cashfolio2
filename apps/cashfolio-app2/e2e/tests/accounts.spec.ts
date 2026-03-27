import { expect, test, type Page } from "@playwright/test";
import {
  agGridCellByColId,
  agGridPinnedBottomRow,
  agGridRowByText,
  clickRowAction,
} from "../support/grid";
import {
  resetAndSeedDatabase,
  seedAssetAccountWithMissingReferenceBalance,
  type SeededData,
} from "../support/db";
import { openDialogFromButton } from "../support/ui";

let seeded: SeededData;

test.beforeAll(async () => {
  seeded = await resetAndSeedDatabase();
});

async function expectDashboardPeriodInUrl(
  page: Page,
  accountBookId: string,
  period: "12m" | "10y",
) {
  await expect
    .poll(
      () => {
        const url = new URL(page.url());
        return {
          pathname: url.pathname.replace(/\/$/, ""),
          period: url.searchParams.get("period"),
        };
      },
      { timeout: 15_000 },
    )
    .toEqual({
      pathname: `/${accountBookId}`,
      period: period === "10y" ? "10y" : null,
    });
}

async function selectDashboardPeriod(page: Page, period: "12m" | "10y") {
  const periodLabel = period === "10y" ? "Last 10 years" : "Last 12 months";
  const radioGroup = page.getByRole("radiogroup").first();
  const input = radioGroup
    .locator(`input[type="radio"][value="${period}"]`)
    .first();

  if ((await input.count()) === 0) {
    throw new Error(`Dashboard period radio not found for: ${period}`);
  }

  const optionLabel = radioGroup
    .locator("label")
    .filter({ hasText: periodLabel })
    .first();

  await expect(optionLabel).toBeVisible();
  await optionLabel.click();
  await expect(input).toBeChecked();
}

test("dashboard is default account-book route and links to accounts", async ({
  page,
}) => {
  await page.goto(`/${seeded.accountBookId}`);

  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Income & Expense Overview" }),
  ).toBeVisible();
  await expect(
    page.getByText("Last 12 months · Amounts shown in CHF"),
  ).toBeVisible();
  await expect(
    page.getByText(
      "No income or expense bookings found in the last 12 months.",
    ),
  ).toBeVisible();

  await selectDashboardPeriod(page, "10y");
  await expectDashboardPeriodInUrl(page, seeded.accountBookId, "10y");
  await expect(
    page.getByText("Last 10 years · Amounts shown in CHF"),
  ).toBeVisible();
  await expect(
    page.getByText("No income or expense bookings found in the last 10 years."),
  ).toBeVisible();

  await page.reload();
  await expectDashboardPeriodInUrl(page, seeded.accountBookId, "10y");
  await expect(
    page.getByText("Last 10 years · Amounts shown in CHF"),
  ).toBeVisible();

  await selectDashboardPeriod(page, "12m");
  await expectDashboardPeriodInUrl(page, seeded.accountBookId, "12m");
  await expect(
    page.getByText("Last 12 months · Amounts shown in CHF"),
  ).toBeVisible();

  await page.getByRole("link", { name: "Accounts" }).click();
  await expect(page).toHaveURL(
    new RegExp(`/${seeded.accountBookId}/accounts\\?tab=ASSET&mode=active$`),
  );
});

test("create, edit, archive, and unarchive account", async ({ page }) => {
  await page.goto(`/${seeded.accountBookId}/accounts?tab=ASSET&mode=active`);

  const createdName = "E2E Asset Account";
  const updatedName = "E2E Asset Account Updated";

  const newAccountDialog = await openDialogFromButton(page, {
    buttonName: "Add Account",
    dialogName: "New Account",
  });

  await newAccountDialog.getByLabel("Name").fill(createdName);
  await newAccountDialog.getByRole("textbox", { name: "Currency" }).click();
  await page.getByRole("option", { name: "CHF" }).first().click();
  await newAccountDialog.getByRole("button", { name: "Create" }).click();

  const createdRow = agGridRowByText(page, createdName);
  await expect(createdRow).toBeVisible();

  await clickRowAction(createdRow, "Edit");
  const editDialog = page.getByRole("dialog", { name: "Edit Account" });
  await expect(editDialog).toBeVisible();
  await editDialog.getByLabel("Name").fill(updatedName);
  await page
    .getByRole("dialog", { name: "Edit Account" })
    .getByRole("button", { name: "Save" })
    .click();

  const updatedRow = agGridRowByText(page, updatedName);
  await expect(updatedRow).toBeVisible();

  await clickRowAction(updatedRow, "Archive");
  const archiveDialog = page.getByRole("dialog", { name: "Archive Account" });
  await expect(archiveDialog).toBeVisible();
  await page
    .getByRole("dialog", { name: "Archive Account" })
    .getByRole("button", { name: "Archive" })
    .click();
  await expect(agGridRowByText(page, updatedName)).toHaveCount(0);

  await page.getByRole("link", { name: "Archive" }).click();
  const archivedRow = agGridRowByText(page, updatedName);
  await expect(archivedRow).toBeVisible();

  await archivedRow.dblclick();
  await expect(
    page.getByRole("button", { name: "Add Transaction" }),
  ).toBeVisible();
  await page.goto(`/${seeded.accountBookId}/accounts?tab=ASSET&mode=archived`);
  await expect(archivedRow).toBeVisible();

  await clickRowAction(archivedRow, "Unarchive");
  await expect(agGridRowByText(page, updatedName)).toHaveCount(0);

  await page.goto(`/${seeded.accountBookId}/accounts?tab=ASSET&mode=active`);
  const unarchivedRow = agGridRowByText(page, updatedName);
  await expect(unarchivedRow).toBeVisible();
});

test("navigate from accounts grid to ledger", async ({ page }) => {
  await page.goto(`/${seeded.accountBookId}/accounts?tab=ASSET&mode=active`);

  const cashRow = agGridRowByText(page, seeded.cashAccount.name);
  await expect(cashRow).toBeVisible();
  await cashRow.dblclick();

  await expect(page).toHaveURL(
    new RegExp(`/${seeded.accountBookId}/${seeded.cashAccount.id}`),
  );
  await expect(
    page.getByRole("button", { name: "Add Transaction" }),
  ).toBeVisible();
});

test("balance column visibility and baseline values across tabs/modes", async ({
  page,
}) => {
  await page.goto(`/${seeded.accountBookId}/accounts?tab=ASSET&mode=active`);

  await expect(page.getByRole("columnheader", { name: "Ccy." })).toBeVisible();
  await expect(
    page.getByRole("columnheader", { name: "Symbol" }),
  ).toBeVisible();
  await expect(
    page.getByRole("columnheader", { name: "Balance", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("columnheader", { name: /^Balance \([A-Z]{3}\)$/ }),
  ).toBeVisible();
  const assetFooterRow = agGridPinnedBottomRow(page);
  await expect(assetFooterRow).toContainText("Total");
  await expect(
    agGridCellByColId(assetFooterRow, "balanceInReferenceCurrency"),
  ).toHaveText("0.00");

  const cashRow = agGridRowByText(page, seeded.cashAccount.name);
  await expect(agGridCellByColId(cashRow, "balance")).toHaveText("0.00");
  await expect(
    agGridCellByColId(cashRow, "balanceInReferenceCurrency"),
  ).toHaveText("0.00");
  const cryptoRow = agGridRowByText(page, seeded.cryptoAccount.name);
  await expect(agGridCellByColId(cryptoRow, "balance")).toHaveText("0.00");
  await expect(
    agGridCellByColId(cryptoRow, "balanceInReferenceCurrency"),
  ).toHaveText("0.00");
  const securityRow = agGridRowByText(page, seeded.securityAccount.name);
  await expect(agGridCellByColId(securityRow, "balance")).toHaveText("0.00");
  await expect(
    agGridCellByColId(securityRow, "balanceInReferenceCurrency"),
  ).toHaveText("0.00");

  const assetsGroupRow = agGridRowByText(page, "Assets");
  await expect(agGridCellByColId(assetsGroupRow, "balance")).toHaveText(
    /^\s*$/,
  );
  await expect(
    agGridCellByColId(assetsGroupRow, "balanceInReferenceCurrency"),
  ).toHaveText("0.00");

  await page.getByRole("link", { name: "Archive" }).click();
  await expect(
    page.getByRole("columnheader", { name: "Balance", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("columnheader", { name: /^Balance \([A-Z]{3}\)$/ }),
  ).toBeVisible();
  const archivedFooterRow = agGridPinnedBottomRow(page);
  await expect(archivedFooterRow).toContainText("Total");
  await expect(
    agGridCellByColId(archivedFooterRow, "balanceInReferenceCurrency"),
  ).toHaveText("0.00");

  await page.goto(
    `/${seeded.accountBookId}/accounts?tab=LIABILITY&mode=active`,
  );
  await expect(
    page.getByRole("columnheader", { name: "Balance", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("columnheader", { name: /^Balance \([A-Z]{3}\)$/ }),
  ).toBeVisible();
  const liabilityFooterRow = agGridPinnedBottomRow(page);
  await expect(liabilityFooterRow).toContainText("Total");
  await expect(
    agGridCellByColId(liabilityFooterRow, "balanceInReferenceCurrency"),
  ).toHaveText("0.00");

  await page.goto(
    `/${seeded.accountBookId}/accounts?tab=EQUITY-${encodeURIComponent("EXPENSE")}&mode=active`,
  );
  await expect(
    page.getByRole("columnheader", { name: "Balance", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("columnheader", { name: /^Balance \([A-Z]{3}\)$/ }),
  ).toHaveCount(0);
  await expect(page.locator(".ag-row-pinned")).toHaveCount(0);
});

test("footer total stays blank when an account ref-currency balance is missing", async ({
  page,
}) => {
  const missingFxAccount = await seedAssetAccountWithMissingReferenceBalance({
    accountBookId: seeded.accountBookId,
    counterAccountId: seeded.cashAccount.id,
  });

  await page.goto(`/${seeded.accountBookId}/accounts?tab=ASSET&mode=active`);

  const missingFxRow = agGridRowByText(page, missingFxAccount.name);
  await expect(missingFxRow).toBeVisible();
  await expect(
    agGridCellByColId(missingFxRow, "balanceInReferenceCurrency"),
  ).toHaveText(/^\s*$/);

  const footerRow = agGridPinnedBottomRow(page);
  await expect(footerRow).toContainText("Total");
  await expect(
    agGridCellByColId(footerRow, "balanceInReferenceCurrency"),
  ).toHaveText(/^\s*$/);
});
