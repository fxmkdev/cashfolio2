import { seedDatabase, type SeededData } from "../support/db";
import { prisma } from "../support/db-client";
import { expect, test, useIsolatedE2EUser } from "../support/fixtures";

let seeded: SeededData;

test.beforeEach(async ({ context }, testInfo) => {
  const externalId = await useIsolatedE2EUser(context, testInfo);
  seeded = await seedDatabase({ userExternalId: externalId });
});

test("the retired deletion page returns not found without redirecting", async ({
  page,
}) => {
  const response = await page.goto("/account/delete");

  expect(response?.status()).toBe(404);
  await expect(page).toHaveURL(/\/account\/delete$/);
  await expect(
    page.getByRole("heading", { name: "Page Not Found", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Delete My Cashfolio Account" }),
  ).toHaveCount(0);
});

test("POST to the retired URL preserves the user and linked books", async ({
  page,
  baseURL,
}) => {
  const getUserAndBooks = () =>
    prisma.user.findUniqueOrThrow({
      where: { externalId: seeded.userExternalId },
      include: {
        accountBookLinks: {
          include: { accountBook: { include: { accounts: true } } },
        },
      },
    });
  const before = await getUserAndBooks();
  expect(before.accountBookLinks).toHaveLength(1);

  const response = await page.request.post("/account/delete", {
    headers: { origin: new URL(baseURL!).origin },
    maxRedirects: 0,
  });

  expect([404, 405]).toContain(response.status());
  expect(response.headers().location).toBeUndefined();
  expect(await getUserAndBooks()).toEqual(before);
});

test("the canonical URL renders the preview and success state", async ({
  page,
}) => {
  const response = await page.goto("/user/delete");
  expect(response?.status()).toBe(200);
  await expect(
    page.getByRole("heading", { name: "Delete Your Cashfolio Account" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Account Books to Delete" }),
  ).toBeVisible();
  await expect(
    page.getByText("E2E Account Book", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Account Books to Leave Shared" }),
  ).toBeVisible();
  await expect(page.locator('form[action="/user/delete"]')).toHaveAttribute(
    "method",
    "post",
  );
  await expect(
    page.getByRole("button", { name: "Delete My Cashfolio Account" }),
  ).toBeVisible();

  const success = await page.goto("/user/delete?deleted=1");
  expect(success?.status()).toBe(200);
  await expect(
    page.getByRole("heading", {
      name: "Cashfolio account deleted",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Delete My Cashfolio Account" }),
  ).toHaveCount(0);
});
