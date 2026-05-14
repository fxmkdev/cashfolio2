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

  await page.getByRole("link", { name: "Activity" }).click();
  await expect(page).toHaveURL(new RegExp(`/${seeded.accountBookId}/activity`));
  await expect(page.getByRole("heading", { name: "Activity" })).toBeVisible();

  await page.getByRole("link", { name: "Period" }).click();
  await expect(page).toHaveURL(new RegExp(`/${seeded.accountBookId}/period$`));
  await expect(page.getByRole("heading", { name: "Period" })).toBeVisible();

  await page.getByRole("link", { name: "Timeline" }).click();
  await expect(page).toHaveURL(
    new RegExp(`/${seeded.accountBookId}/timeline$`),
  );
  await expect(page.getByRole("heading", { name: "Timeline" })).toBeVisible();

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

  const burger = page.getByRole("button", { name: "Toggle navigation" });
  await expect(burger).toBeVisible();

  await burger.click();
  const timelineLink = page.getByRole("link", { name: "Timeline" });
  await expect(timelineLink).toBeVisible();
  await timelineLink.click();

  await expect(page).toHaveURL(
    new RegExp(`/${seeded.accountBookId}/timeline$`),
  );
  await expect(page.getByRole("heading", { name: "Timeline" })).toBeVisible();
});
