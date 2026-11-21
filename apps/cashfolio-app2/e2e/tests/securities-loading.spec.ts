import { seedDatabase } from "../support/db";
import { prisma } from "../support/db-client";
import { expect, test } from "../support/fixtures";
let accountBookId: string;
test.beforeAll(async ({ e2eExternalId }) => {
  accountBookId = (await seedDatabase({ userExternalId: e2eExternalId }))
    .accountBookId;
});
test.beforeEach(async ({ e2eExternalId }) => {
  await prisma.user.update({
    where: { externalId: e2eExternalId },
    data: { securitiesExchangeMic: null },
  });
});
test("a delayed security switch clears enrichment and keeps progress until both requests finish", async ({
  page,
}) => {
  await page.goto(`/${accountBookId}/securities?q=E2E.SEC`);
  const rows = page
    .locator('[row-id] [col-id="name"]')
    .filter({ hasText: "E2E Example Security" });
  await rows.nth(1).click();
  const details = page.getByRole("region", { name: "Security Details" });
  await expect(
    details.getByLabel("Quote Currency", { exact: true }),
  ).toHaveText("CHF");
  await expect(details.getByLabel("ISIN", { exact: true })).toHaveText(
    "Unknown",
  );
  let releaseHistory!: () => void;
  let releaseMetadata!: () => void;
  const historyGate = new Promise<void>((resolve) => {
    releaseHistory = resolve;
  });
  const metadataGate = new Promise<void>((resolve) => {
    releaseMetadata = resolve;
  });
  let waitingHistory = false;
  let waitingMetadata = false;
  await page.route("**/_serverFn/**", async (route) => {
    if (!route.request().url().includes("selectionToken"))
      return route.continue();
    const response = await route.fetch();
    if ((await response.text()).includes("listingId")) {
      waitingMetadata = true;
      await metadataGate;
    } else {
      waitingHistory = true;
      await historyGate;
    }
    await route.fulfill({ response });
  });
  try {
    await rows.nth(0).click();
    await expect.poll(() => waitingHistory && waitingMetadata).toBe(true);
    for (const label of ["ISIN", "Quote Currency", "Security Type"]) {
      await expect(details.getByLabel(label, { exact: true })).toHaveAttribute(
        "aria-busy",
        "true",
      );
      await expect(
        details.getByLabel(label, { exact: true }),
      ).not.toContainText(/CHF|Unknown/);
    }
    await expect(details.getByLabel("Loading Price History")).toBeVisible();
    await expect(page.getByTestId("global-loading-indicator")).toHaveAttribute(
      "data-mounted",
      "true",
    );
    releaseHistory();
    await expect(
      details.getByLabel("Quote Currency", { exact: true }),
    ).toHaveText("USD");
    await expect(details.getByLabel("ISIN", { exact: true })).toHaveAttribute(
      "aria-busy",
      "true",
    );
    await expect(page.getByTestId("global-loading-indicator")).toHaveAttribute(
      "data-mounted",
      "true",
    );
    releaseMetadata();
    await expect(details.getByLabel("ISIN", { exact: true })).toHaveText(
      "US0000000000",
    );
    await expect(
      page.getByTestId("global-loading-indicator"),
    ).not.toHaveAttribute("data-mounted");
  } finally {
    releaseHistory();
    releaseMetadata();
    await page.unroute("**/_serverFn/**");
  }
});

test("results use quiet skeleton cells during loading and retry while preserving selection", async ({
  page,
}) => {
  let releaseInitial!: () => void;
  let releasePage!: () => void;
  let releaseRetry!: () => void;
  const initialGate = new Promise<void>((resolve) => {
    releaseInitial = resolve;
  });
  const pageGate = new Promise<void>((resolve) => {
    releasePage = resolve;
  });
  const retryGate = new Promise<void>((resolve) => {
    releaseRetry = resolve;
  });
  let searches = 0;
  let selectionRequests = 0;
  await page.route("**/_serverFn/**", async (route) => {
    const url = route.request().url();
    if (url.includes("selectionToken")) selectionRequests++;
    if (!url.includes("criteria")) return route.continue();
    searches++;
    if (searches === 1) await initialGate;
    if (searches === 2) {
      await pageGate;
      return route.fulfill({
        status: 503,
        contentType: "text/plain",
        body: "Results unavailable",
      });
    }
    if (searches === 3) await retryGate;
    return route.continue();
  });
  const results = page.getByRole("region", { name: "Security Results" });
  const skeletons = results.getByTestId("security-result-skeleton");
  try {
    await page.goto(`/${accountBookId}/securities?q=`);
    await expect(skeletons.first()).toBeVisible();
    await expect(skeletons.first()).toHaveAttribute("aria-hidden", "true");
    await expect(results).toHaveAttribute("aria-busy", "true");
    await expect(
      results.getByRole("columnheader", { name: /^Name/ }),
    ).toBeVisible();
    await expect(results.locator(".ag-loading-icon")).toHaveCount(0);
    await expect(
      results.getByText(/Loading\.{3}|Unknown|No securities found/),
    ).toHaveCount(0);
    await expect(
      page.getByLabel("Result Count", { exact: true }),
    ).not.toHaveText("0 listings");
    await expect(page.getByTestId("global-loading-indicator")).toHaveAttribute(
      "data-mounted",
      "true",
    );
    expect(searches).toBe(1);
    expect(selectionRequests).toBe(0);
    releaseInitial();
    await expect(page.getByLabel("Result Count", { exact: true })).toHaveText(
      "28 listings",
    );
    await expect(skeletons).toHaveCount(0);
    await results
      .locator('[row-id] [col-id="name"]')
      .filter({ hasText: "E2E Example Security" })
      .first()
      .click();
    const details = page.getByRole("region", { name: "Security Details" });
    await expect(details.getByLabel("Latest Closing Price")).toContainText(
      "USD",
    );
    await expect(details.getByLabel("ISIN", { exact: true })).toHaveText(
      "US0000000000",
    );
    const selectedRequests = selectionRequests;
    await page.getByRole("button", { name: "Next Page" }).click();
    await expect(skeletons.first()).toBeVisible();
    await expect(results).toHaveAttribute("aria-busy", "true");
    await skeletons.first().click();
    await expect(details.getByLabel("Latest Closing Price")).toContainText(
      "USD",
    );
    expect(selectionRequests).toBe(selectedRequests);
    releasePage();
    await expect(
      page.getByRole("button", { name: "Retry Results" }),
    ).toBeVisible();
    await expect(results).toHaveAttribute("aria-busy", "false");
    await expect(skeletons).toHaveCount(0);
    await expect(results.getByText(/Loading\.{3}|ERR/)).toHaveCount(0);
    await expect(
      page.getByTestId("global-loading-indicator"),
    ).not.toHaveAttribute("data-mounted");
    await page.getByRole("button", { name: "Retry Results" }).click();
    await expect(skeletons.first()).toBeVisible();
    await expect(results).toHaveAttribute("aria-busy", "true");
    await expect(page.getByTestId("global-loading-indicator")).toHaveAttribute(
      "data-mounted",
      "true",
    );
    releaseRetry();
    await expect(results).toHaveAttribute("aria-busy", "false");
    await expect(skeletons).toHaveCount(0);
    await expect(
      results
        .locator('[row-id] [col-id="symbol"]')
        .filter({ hasText: "E2E.PAGE.17" }),
    ).toBeVisible();
    await expect(details.getByLabel("Latest Closing Price")).toContainText(
      "USD",
    );
    expect(searches).toBe(3);
    expect(selectionRequests).toBe(selectedRequests);
  } finally {
    releaseInitial();
    releasePage();
    releaseRetry();
    await page.unroute("**/_serverFn/**");
  }
});
