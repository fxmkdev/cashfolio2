import { createId } from "@paralleldrive/cuid2";
import { seedDatabase } from "../support/db";
import { prisma } from "../support/db-client";
import { expect, test } from "../support/fixtures";
import { selectSegmentedControlOption } from "../support/segmented-control";
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
test("URL refresh restores query, exact selection, page and local chart range", async ({
  page,
}) => {
  await page.goto(
    `/${accountBookId}/securities?q=E2E.PAGE&page=2&selectedSymbol=E2E.SEC&selectedMic=XNAS&range=5Y`,
  );
  await expect(
    page.getByRole("button", { name: "Page 2", exact: true }),
  ).toHaveAttribute("data-active");
  await expect(
    page
      .locator('[row-id] [col-id="symbol"]')
      .filter({ hasText: "E2E.PAGE.21" }),
  ).toBeVisible();
  const details = page.getByRole("region", { name: "Security Details" });
  await expect(details.getByLabel("ISIN", { exact: true })).toHaveText(
    "US0000000000",
  );
  await expect(details.getByLabel("Latest Closing Price")).toContainText("USD");
  await expect(
    details.getByRole("radio", { name: "5Y", exact: true }),
  ).toBeChecked();
  await page.reload();
  await expect(details.getByLabel("Latest Closing Price")).toContainText("USD");
  await expect(
    details.getByRole("radio", { name: "5Y", exact: true }),
  ).toBeChecked();
  await expect(
    page.getByRole("button", { name: "Page 2", exact: true }),
  ).toHaveAttribute("data-active");
  await details.getByRole("button", { name: "Close Details" }).click();
  await expect(page).not.toHaveURL(/selectedSymbol/);
  await page.goBack();
  await expect(details.getByLabel("ISIN", { exact: true })).toHaveText(
    "US0000000000",
  );
  await selectSegmentedControlOption(details, "1M");
  await expect(page).toHaveURL(/range=1M/);
  await page.goBack();
  await expect(
    details.getByRole("radio", { name: "5Y", exact: true }),
  ).toBeChecked();
  await page.goForward();
  await expect(
    details.getByRole("radio", { name: "1M", exact: true }),
  ).toBeChecked();
});

test("exchange choices persist on the user and submitted URLs override the saved default", async ({
  page,
  e2eExternalId,
}) => {
  const other = await prisma.user.create({
    data: {
      id: createId(),
      externalId: `securities-preference-${createId()}`,
      securitiesExchangeMic: "XNYS",
    },
  });
  const secondBook = await seedDatabase({ userExternalId: e2eExternalId });
  await page.goto(`/${accountBookId}/securities`);
  const exchange = page.getByRole("combobox", { name: "Exchange" });
  await exchange.click();
  await exchange.fill("Swiss");
  await page.getByRole("option", { name: "SIX Swiss Exchange (XSWX)" }).click();
  await expect
    .poll(
      async () =>
        (
          await prisma.user.findUniqueOrThrow({
            where: { externalId: e2eExternalId },
          })
        ).securitiesExchangeMic,
    )
    .toBe("XSWX");
  await expect(page.getByLabel("Submitted Search")).toHaveCount(0);
  await page.reload();
  await expect(exchange).toHaveValue("SIX Swiss Exchange (XSWX)");
  await page.goto(`/${secondBook.accountBookId}/securities`);
  await expect(exchange).toHaveValue("SIX Swiss Exchange (XSWX)");
  expect(
    (await prisma.user.findUniqueOrThrow({ where: { id: other.id } }))
      .securitiesExchangeMic,
  ).toBe("XNYS");
  await expect(page.getByLabel("Submitted Search")).toHaveCount(0);
  await page.goto(`/${accountBookId}/securities?q=E2E.SEC`);
  await expect(exchange).toHaveValue("");
  await expect(page.getByLabel("Result Count", { exact: true })).toHaveText(
    "2 listings",
  );
  expect(
    (
      await prisma.user.findUniqueOrThrow({
        where: { externalId: e2eExternalId },
      })
    ).securitiesExchangeMic,
  ).toBe("XSWX");
  await page.goto(`/${accountBookId}/securities`);
  await expect(exchange).toHaveValue("SIX Swiss Exchange (XSWX)");
  await page.getByRole("button", { name: "Clear Exchange" }).click();
  await expect
    .poll(
      async () =>
        (
          await prisma.user.findUniqueOrThrow({
            where: { externalId: e2eExternalId },
          })
        ).securitiesExchangeMic,
    )
    .toBeNull();
  await page.reload();
  await expect(exchange).toHaveValue("");
  await prisma.user.delete({ where: { id: other.id } });
});

test("a missing URL selection leaves browsable results and an actionable close", async ({
  page,
}) => {
  await page.goto(
    `/${accountBookId}/securities?q=E2E.SEC&selectedSymbol=E2E.MISSING&selectedMic=XNAS`,
  );
  await expect(
    page.getByText("Selection Unavailable", { exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Result Count", { exact: true })).toHaveText(
    "2 listings",
  );
  await page.getByRole("button", { name: "Back to Results" }).click();
  await expect(page).not.toHaveURL(/selectedSymbol/);
  await page
    .locator('[row-id] [col-id="name"]')
    .filter({ hasText: "E2E Example Security" })
    .first()
    .click();
  await expect(page.getByLabel("Latest Closing Price")).toContainText("USD");
});

test("a failed preference save stays nonblocking and retries explicitly", async ({
  page,
  e2eExternalId,
}) => {
  let writes = 0;
  await page.route("**/_serverFn/**", async (route) => {
    if (
      route.request().method() !== "POST" ||
      !route.request().postData()?.includes("exchange")
    )
      return route.continue();
    if (++writes === 1)
      return route.fulfill({
        status: 503,
        contentType: "text/plain",
        body: "Preference unavailable",
      });
    return route.continue();
  });
  await page.goto(`/${accountBookId}/securities`);
  const exchange = page.getByRole("combobox", { name: "Exchange" });
  await exchange.click();
  await exchange.fill("Swiss");
  await page.getByRole("option", { name: "SIX Swiss Exchange (XSWX)" }).click();
  await expect(
    page.getByText("Exchange Preference Not Saved", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("textbox", { name: "Security", exact: true })
    .fill("E2E.SEC");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page.getByLabel("Result Count", { exact: true })).toHaveText(
    "1 listing",
  );
  await page.getByRole("button", { name: "Retry Saving Preference" }).click();
  await expect
    .poll(
      async () =>
        (
          await prisma.user.findUniqueOrThrow({
            where: { externalId: e2eExternalId },
          })
        ).securitiesExchangeMic,
    )
    .toBe("XSWX");
  await expect(
    page.getByText("Exchange Preference Not Saved", { exact: true }),
  ).toHaveCount(0);
  expect(writes).toBe(2);
});

test("rapid exchange choices serialize saves and persist only the latest queued choice", async ({
  page,
  e2eExternalId,
}) => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const writes: string[] = [];
  await page.route("**/_serverFn/**", async (route) => {
    const request = route.request();
    if (
      request.method() !== "POST" ||
      !request.postData()?.includes("exchange")
    )
      return route.continue();
    writes.push(request.postData()!);
    if (writes.length === 1) await gate;
    return route.continue();
  });
  try {
    await page.goto(`/${accountBookId}/securities`);
    const exchange = page.getByRole("combobox", { name: "Exchange" });
    await exchange.click();
    await exchange.fill("Swiss");
    await page
      .getByRole("option", { name: "SIX Swiss Exchange (XSWX)" })
      .click();
    await expect.poll(() => writes.length).toBe(1);
    await page.getByRole("button", { name: "Clear Exchange" }).click();
    await exchange.click();
    await exchange.fill("NASDAQ");
    await page
      .getByRole("option", { name: "NASDAQ (XNAS)", exact: true })
      .click();
    expect(writes).toHaveLength(1);
    release();
    await expect
      .poll(
        async () =>
          (
            await prisma.user.findUniqueOrThrow({
              where: { externalId: e2eExternalId },
            })
          ).securitiesExchangeMic,
      )
      .toBe("XNAS");
    expect(writes).toHaveLength(2);
    expect(writes[0]).toContain("XSWX");
    expect(writes[1]).toContain("XNAS");
    await expect(page.getByLabel("Submitted Search")).toHaveCount(0);
    await page.reload();
    await expect(exchange).toHaveValue("NASDAQ (XNAS)");
  } finally {
    release();
    await page.unroute("**/_serverFn/**");
  }
});
