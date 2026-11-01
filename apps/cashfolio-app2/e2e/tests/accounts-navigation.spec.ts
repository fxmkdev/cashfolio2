import { UserRole } from "../../src/.prisma-client/enums";
import { seedDatabase, type SeededData } from "../support/db";
import { expect, test } from "../support/fixtures";

let seeded: SeededData;

test.beforeAll(async ({ e2eExternalId }) => {
  seeded = await seedDatabase({
    userExternalId: e2eExternalId,
    userRoles: [UserRole.ADMIN],
  });
});

test("account-book sidebar links navigate between key sections", async ({
  page,
}) => {
  await page.goto(`/${seeded.accountBookId}`);

  await expect(page).toHaveURL(
    new RegExp(`/${seeded.accountBookId}/accounts\\?tab=BALANCE&mode=active$`),
  );
  await expect(page.getByRole("heading", { name: "Accounts" })).toBeVisible();

  await page.getByRole("link", { name: "Transactions" }).click();
  await expect(page).toHaveURL(
    new RegExp(`/${seeded.accountBookId}/transactions`),
  );
  await expect(
    page.getByRole("heading", { name: "Transactions" }),
  ).toBeVisible();

  await page.getByRole("link", { name: "Report" }).click();
  await expect(page).toHaveURL(new RegExp(`/${seeded.accountBookId}/report$`));
  await expect(page.getByTestId("period-picker-trigger")).toBeVisible();

  await page.getByRole("link", { name: "History" }).click();
  await expect(page).toHaveURL(new RegExp(`/${seeded.accountBookId}/history$`));
  await expect(page.getByRole("heading", { name: "History" })).toBeVisible();

  await expect(
    page.getByRole("link", { name: "Valuation Cache" }),
  ).not.toBeVisible();

  await page.getByRole("link", { name: "Accounts" }).click();
  await expect(page).toHaveURL(
    new RegExp(`/${seeded.accountBookId}/accounts\\?tab=BALANCE&mode=active$`),
  );
});

test("mobile sidebar burger reveals and uses navigation links", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/${seeded.accountBookId}/accounts?tab=BALANCE&mode=active`);

  const burger = page.getByRole("button", { name: "Toggle Navigation" });
  await expect(burger).toBeVisible();

  await burger.click();
  const historyLink = page.getByRole("link", { name: "History" });
  await expect(historyLink).toBeVisible();
  await historyLink.click();

  await expect(page).toHaveURL(new RegExp(`/${seeded.accountBookId}/history$`));
  await expect(page.getByRole("heading", { name: "History" })).toBeVisible();
});

test("asset class grouping survives legacy redirects, reload, history and ledger return", async ({
  page,
}) => {
  await page.goto(
    `/${seeded.accountBookId}/accounts?tab=ASSET&mode=archived&grouping=assetClass`,
  );
  const grouping = page.getByRole("combobox", { name: "Group By" });
  await expect(grouping).toHaveValue("Asset Class");
  await expect(page).toHaveURL(/grouping=assetClass/);
  await page.reload();
  await expect(grouping).toHaveValue("Asset Class");
  await grouping.click();
  await page
    .getByRole("option", { name: "Account Structure", exact: true })
    .click();
  await expect(grouping).toHaveValue("Account Structure");
  await page.goBack();
  await expect(grouping).toHaveValue("Asset Class");
  const source = page.url();
  const chfUnit = page
    .locator('[row-id^="__asset_class_unit__:"]')
    .filter({ hasText: "CHF" })
    .first();
  await expect(chfUnit).toHaveAttribute("aria-expanded", "false");
  await chfUnit.locator(".ag-group-contracted").click();
  await page
    .locator(
      `[row-id="${seeded.cashAccount.id}"] [col-id="ag-Grid-AutoColumn"]`,
    )
    .dblclick();
  await expect(page).toHaveURL(
    new RegExp(`/${seeded.accountBookId}/${seeded.cashAccount.id}`),
  );
  // Balance ledgers use browser history for return navigation; contextual Back
  // links are reserved for category ledgers.
  await page.goBack();
  await expect(page).toHaveURL(source);
  await expect(grouping).toHaveValue("Asset Class");
});

test("admin shell exposes the global valuation cache", async ({ page }) => {
  await page.goto("/admin");

  await expect(page).toHaveURL(/\/admin\/?$/);
  await expect(page.getByRole("heading", { name: "Admin" })).toBeVisible();

  await page.getByRole("link", { name: "Valuation Cache" }).click();
  await expect(page).toHaveURL(/\/admin\/valuation-cache$/);
  await expect(
    page.getByRole("heading", { name: "Valuation Cache" }),
  ).toBeVisible();
});
