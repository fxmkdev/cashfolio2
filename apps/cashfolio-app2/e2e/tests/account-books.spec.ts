import {
  expect,
  test,
  type BrowserContext,
  type TestInfo,
} from "@playwright/test";
import { createId } from "@paralleldrive/cuid2";
import {
  AccountType,
  EquityAccountSubtype,
} from "../../src/.prisma-client/enums";
import { getAccountsForAccountBook, getUserAccountBooks } from "../support/db";

const E2E_AUTH_EXTERNAL_ID_COOKIE = "cashfolio-e2e-external-id";
const activeAssetAccountsUrlPattern =
  /\/[^/]+\/accounts\?(?=.*\bmode=active\b)(?=.*\btab=ASSET\b)/;

async function useIsolatedUser(context: BrowserContext, testInfo: TestInfo) {
  const externalId = `e2e-${testInfo.workerIndex}-${createId()}`;
  const baseURL =
    typeof testInfo.project.use.baseURL === "string"
      ? testInfo.project.use.baseURL
      : "http://127.0.0.1:4173";

  await context.addCookies([
    {
      name: E2E_AUTH_EXTERNAL_ID_COOKIE,
      value: externalId,
      url: baseURL,
    },
  ]);

  return externalId;
}

function getAccountBookIdFromAccountsUrl(url: string): string {
  const match = new URL(url).pathname.match(/^\/([^/]+)\/accounts$/);
  if (!match?.[1]) {
    throw new Error(`Expected account-book accounts URL, received: ${url}`);
  }

  return match[1];
}

test("redirects users without account books to account-book creation", async ({
  context,
  page,
}, testInfo) => {
  const externalId = await useIsolatedUser(context, testInfo);

  await page.goto("/");

  await expect(page).toHaveURL(/\/account-books\/new$/);
  await expect(
    page.getByRole("heading", { name: "Create Account Book" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
  await expect(await getUserAccountBooks(externalId)).toHaveLength(0);
});

test("creates a new empty account book and makes it available in navigation", async ({
  context,
  page,
}, testInfo) => {
  const externalId = await useIsolatedUser(context, testInfo);
  const accountBookName = `E2E Created ${createId()}`;

  await page.goto("/account-books/new");
  await page.getByLabel("Account Book Name").fill(accountBookName);
  await page.getByRole("button", { name: "Create" }).click();

  await expect(page).toHaveURL(activeAssetAccountsUrlPattern);
  await expect(
    page.getByRole("button", { name: accountBookName }),
  ).toBeVisible();

  const accountBookId = getAccountBookIdFromAccountsUrl(page.url());
  const accountBooks = await getUserAccountBooks(externalId);
  expect(accountBooks).toEqual([
    expect.objectContaining({
      id: accountBookId,
      name: accountBookName,
      referenceCurrency: "CHF",
    }),
  ]);

  const accounts = await getAccountsForAccountBook(accountBookId);
  expect(accounts).toEqual([
    expect.objectContaining({
      name: "Gain/Loss",
      type: AccountType.EQUITY,
      equityAccountSubtype: EquityAccountSubtype.GAIN_LOSS,
    }),
  ]);

  await page.getByRole("button", { name: accountBookName }).click();
  await expect(
    page.getByRole("menuitem", { name: accountBookName }),
  ).toBeVisible();
});

test("deletes an account book after typed-name confirmation and redirects to creation when none remain", async ({
  context,
  page,
}, testInfo) => {
  const externalId = await useIsolatedUser(context, testInfo);
  const accountBookName = `E2E Deleted ${createId()}`;

  await page.goto("/account-books/new");
  await page.getByLabel("Account Book Name").fill(accountBookName);
  await page.getByRole("button", { name: "Create" }).click();
  await expect(page).toHaveURL(activeAssetAccountsUrlPattern);

  const accountBookId = getAccountBookIdFromAccountsUrl(page.url());
  await page.goto(`/${accountBookId}/settings`);

  await page
    .getByRole("button", { name: "Delete Account Book" })
    .first()
    .click();
  const dialog = page.getByRole("dialog", { name: "Delete Account Book" });
  await expect(dialog).toBeVisible();

  const confirmDeleteButton = dialog.getByRole("button", {
    name: "Delete Account Book",
  });
  await expect(confirmDeleteButton).toBeDisabled();

  await dialog.getByLabel("Account Book Name").fill(accountBookName);
  await expect(confirmDeleteButton).toBeEnabled();
  await confirmDeleteButton.click();

  await expect(page).toHaveURL(/\/account-books\/new$/);
  await expect(
    page.getByRole("heading", { name: "Create Account Book" }),
  ).toBeVisible();
  await expect(await getUserAccountBooks(externalId)).toHaveLength(0);
});
