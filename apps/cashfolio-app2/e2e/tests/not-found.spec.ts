import { createId } from "@paralleldrive/cuid2";
import { seedDatabase, type SeededData } from "../support/db";
import { prisma } from "../support/db-client";
import {
  expect,
  test,
  useIsolatedE2EUser,
  type Page,
} from "../support/fixtures";

let seeded: SeededData;
let browserErrors: string[];

test.beforeEach(async ({ context, page }, testInfo) => {
  const externalId = await useIsolatedE2EUser(context, testInfo);
  seeded = await seedDatabase({ userExternalId: externalId });
  browserErrors = [];
  page.on("pageerror", (error) => browserErrors.push(error.message));
  page.on("console", (message) => {
    if (/seroval|serialization error/i.test(message.text())) {
      browserErrors.push(message.text());
    }
  });
});

async function expectNotFoundPage(
  page: Page,
  path: string,
  isAuthenticated = true,
) {
  await expect(page).toHaveURL(new URL(path, page.url()).href);
  await expect(
    page.getByRole("heading", { name: "Page Not Found", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("main")).toContainText("404");
  await expect(page.getByRole("main")).toContainText(
    "The page you requested could not be found or is no longer available.",
  );
  await expect(page.getByRole("link", { name: "Go to App" })).toHaveAttribute(
    "href",
    "/",
  );
  await expect(page.getByRole("navigation")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Sign Out", exact: true }),
  ).toHaveCount(isAuthenticated ? 1 : 0);
  expect(browserErrors).toEqual([]);
}

test("Sign Out stays hidden until authentication is confirmed", async ({
  page,
}) => {
  let confirmAuthentication!: () => void;
  const confirmation = new Promise<void>((resolve) => {
    confirmAuthentication = resolve;
  });
  let markCheckStarted!: () => void;
  const checkStarted = new Promise<void>((resolve) => {
    markCheckStarted = resolve;
  });
  // Direct 404 loads run route loaders on the server; the only browser RPC is
  // the page's session-status check after hydration.
  await page.route("**/_serverFn/**", async (route) => {
    expect(route.request().method()).toBe("GET");
    markCheckStarted();
    await confirmation;
    await route.fulfill({ json: { result: true } });
  });
  const path = `/${createId()}/accounts?tab=BALANCE&mode=active`;

  try {
    const response = await page.goto(path);
    expect(response?.status()).toBe(404);
    await checkStarted;
    await expectNotFoundPage(page, path, false);
  } finally {
    confirmAuthentication();
  }

  await expectNotFoundPage(page, path);
});

for (const status of ["signed out", "unavailable"] as const) {
  test(`Sign Out stays hidden when authentication is ${status}`, async ({
    page,
  }) => {
    const checkCompleted = page.waitForResponse((response) =>
      response.url().includes("/_serverFn/"),
    );
    await page.route("**/_serverFn/**", async (route) => {
      expect(route.request().method()).toBe("GET");
      if (status === "signed out") {
        await route.fulfill({ json: { result: false } });
      } else {
        await route.fulfill({
          status: 503,
          contentType: "text/plain",
          body: "Session unavailable",
        });
      }
    });
    const path = `/${createId()}/accounts?tab=BALANCE&mode=active`;
    const response = await page.goto(path);
    expect(response?.status()).toBe(404);
    await (await checkCompleted).finished();
    await expectNotFoundPage(page, path, false);
    await expect(page.getByRole("link", { name: "Go to App" })).toBeVisible();
  });
}

test("Sign Out submits the existing POST endpoint", async ({ page }) => {
  const path = `/${createId()}/accounts?tab=BALANCE&mode=active`;
  await page.goto(path);
  await expectNotFoundPage(page, path);
  await page.route("**/api/logto/sign-out", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "text/html",
      body: "Signed out",
    });
  });
  const submission = page.waitForRequest(
    (request) => new URL(request.url()).pathname === "/api/logto/sign-out",
  );

  await page.getByRole("button", { name: "Sign Out", exact: true }).click();
  const request = await submission;
  expect(request.method()).toBe("POST");
  expect(request.isNavigationRequest()).toBe(true);
});

async function expectDirectNotFound(page: Page, path: string) {
  const response = await page.goto(path);
  expect(response?.status()).toBe(404);
  // Assert that the production server rendered the page, before hydration.
  expect(await response?.text()).toMatch(/<h1\b[^>]*>Page Not Found<\/h1>/);
  await expectNotFoundPage(page, path);
}

for (const scenario of ["missing book", "missing ledger", "unmatched path"]) {
  test(`direct requests show a rendered 404 for ${scenario}`, async ({
    page,
  }) => {
    const path =
      scenario === "missing book"
        ? `/${createId()}/accounts?tab=BALANCE&mode=active`
        : scenario === "missing ledger"
          ? `/${seeded.accountBookId}/${createId()}`
          : `/${seeded.accountBookId}/accounts/unknown/extra?tab=BALANCE&mode=active`;

    await expectDirectNotFound(page, path);
    await page.getByRole("link", { name: "Go to App" }).click();
    await expect(page).toHaveURL(
      new RegExp(`/${seeded.accountBookId}/accounts(?:\\?|$)`),
    );
    await expect(
      page.getByRole("heading", { name: "Accounts", exact: true }),
    ).toBeVisible();
    expect(browserErrors).toEqual([]);
  });
}

test("an inaccessible book uses the same 404 without exposing its details", async ({
  page,
}) => {
  const otherBook = await seedDatabase({
    userExternalId: `other-user-${createId()}`,
  });
  await prisma.accountBook.update({
    where: { id: otherBook.accountBookId },
    data: { name: "Private book that must not be disclosed" },
  });

  await expectDirectNotFound(
    page,
    `/${otherBook.accountBookId}/accounts?tab=BALANCE&mode=active`,
  );
  await expect(
    page.getByText("Private book that must not be disclosed"),
  ).toHaveCount(0);
});

test("a ledger account belonging to another book is not disclosed", async ({
  page,
}) => {
  const otherBook = await seedDatabase({
    userExternalId: `other-user-${createId()}`,
  });

  await expectDirectNotFound(
    page,
    `/${seeded.accountBookId}/${otherBook.cashAccount.id}`,
  );
});

test("a deleted book URL shows a 404 and recovers to its replacement", async ({
  page,
}) => {
  const path = `/${seeded.accountBookId}/accounts?tab=BALANCE&mode=active`;
  await prisma.accountBook.delete({ where: { id: seeded.accountBookId } });
  const replacement = await seedDatabase({
    userExternalId: seeded.userExternalId,
  });

  await expectDirectNotFound(page, path);
  await page.getByRole("link", { name: "Go to App" }).click();
  await expect(page).toHaveURL(
    new RegExp(`/${replacement.accountBookId}/accounts(?:\\?|$)`),
  );
});

test("client navigation after a book is deleted shows the standalone 404", async ({
  page,
}) => {
  await page.goto(`/${seeded.accountBookId}/accounts?tab=BALANCE&mode=active`);
  await expect(
    page.getByRole("heading", { name: "Accounts", exact: true }),
  ).toBeVisible();
  await prisma.accountBook.delete({ where: { id: seeded.accountBookId } });

  const documentRequests: string[] = [];
  page.on("request", (request) => {
    if (request.isNavigationRequest() && request.frame() === page.mainFrame()) {
      documentRequests.push(request.url());
    }
  });
  await page.getByRole("link", { name: "Settings", exact: true }).click();

  await expectNotFoundPage(page, `/${seeded.accountBookId}/settings`);
  expect(documentRequests).toEqual([]);
  await page.getByRole("link", { name: "Go to App" }).click();
  await expect(page).toHaveURL(/\/account-books\/new$/);
});
