import { expect, test } from "@playwright/test";
import { seedDatabase, type SeededData } from "../support/db";

let seeded: SeededData;

test.beforeAll(async () => {
  seeded = await seedDatabase();
});

test("account-book sidebar links navigate between key sections", async ({
  page,
}) => {
  await page.goto(`/${seeded.accountBookId}`);

  await expect(page).toHaveURL(
    new RegExp(`/${seeded.accountBookId}/accounts\\?tab=ASSET&mode=active$`),
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
  await expect(page.getByRole("heading", { name: "April 2026" })).toBeVisible();

  await page.getByRole("link", { name: "History" }).click();
  await expect(page).toHaveURL(new RegExp(`/${seeded.accountBookId}/history$`));
  await expect(page.getByRole("heading", { name: "History" })).toBeVisible();

  await page.getByRole("link", { name: "Valuation Cache" }).click();
  await expect(page).toHaveURL(
    new RegExp(`/${seeded.accountBookId}/valuation-cache$`),
  );
  await expect(
    page.getByRole("heading", { name: "Valuation Cache" }),
  ).toBeVisible();

  await page.getByRole("link", { name: "Accounts" }).click();
  await expect(page).toHaveURL(
    new RegExp(`/${seeded.accountBookId}/accounts\\?tab=ASSET&mode=active$`),
  );
});

test("mobile sidebar burger reveals and uses navigation links", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/${seeded.accountBookId}/accounts?tab=ASSET&mode=active`);

  const burger = page.getByRole("button", { name: "Toggle Navigation" });
  await expect(burger).toBeVisible();

  await burger.click();
  const historyLink = page.getByRole("link", { name: "History" });
  await expect(historyLink).toBeVisible();
  await historyLink.click();

  await expect(page).toHaveURL(new RegExp(`/${seeded.accountBookId}/history$`));
  await expect(page.getByRole("heading", { name: "History" })).toBeVisible();
});
