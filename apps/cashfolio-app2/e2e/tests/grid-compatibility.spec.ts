import {
  seedDatabase,
  seedThreeBookingSplitTransaction,
  type SeededData,
} from "../support/db";
import { prisma } from "../support/db-client";
import { agGridRowByText } from "../support/grid";
import { expect, test } from "../support/fixtures";

let seeded: SeededData;
let assetRootId: string;

test.beforeAll(async ({ e2eExternalId }) => {
  seeded = await seedDatabase({ userExternalId: e2eExternalId });
  const root = await prisma.accountGroup.findFirstOrThrow({
    where: { accountBookId: seeded.accountBookId, name: "Assets" },
  });
  assetRootId = root.id;
});

test("restores pre-upgrade expanded group storage and persists collapse", async ({
  page,
}) => {
  const storageKey = `cashfolio:expandedGroups:${seeded.accountBookId}:active:ASSET`;
  await page.addInitScript(
    ({ storageKey, assetRootId }) => {
      // Seed once so a reload verifies the value saved by the application.
      if (sessionStorage.getItem(storageKey) === null) {
        sessionStorage.setItem(storageKey, JSON.stringify([assetRootId]));
      }
    },
    { storageKey, assetRootId },
  );
  await page.goto(`/${seeded.accountBookId}/accounts?tab=ASSET&mode=active`);
  await expect(agGridRowByText(page, seeded.cashAccount.name)).toBeVisible();
  const root = agGridRowByText(page, "Assets");
  await root.locator(".ag-group-expanded").click();
  await expect(agGridRowByText(page, seeded.cashAccount.name)).toHaveCount(0);
  await expect
    .poll(() => page.evaluate((key) => sessionStorage.getItem(key), storageKey))
    .toBe("[]");
  await page.reload();
  await expect(root.locator(".ag-group-contracted")).toBeVisible();
  await expect(agGridRowByText(page, seeded.cashAccount.name)).toHaveCount(0);
  await root.locator(".ag-group-contracted").click();
  await expect(agGridRowByText(page, seeded.cashAccount.name)).toBeVisible();
});

test("ledger remains usable on narrow screens in light and dark themes", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme });
    await page.goto(`/${seeded.accountBookId}/${seeded.cashAccount.id}`);
    const grid = page.locator(".ag-root-wrapper").first();
    await expect(grid).toBeVisible();
    const viewport = grid.locator(".ag-grid-viewport");
    await expect
      .poll(() =>
        viewport.evaluate(
          (element) => element.scrollWidth > element.clientWidth,
        ),
      )
      .toBe(true);
    await viewport.evaluate((element) => {
      element.scrollLeft = element.scrollWidth;
    });
    await expect
      .poll(() => viewport.evaluate((element) => element.scrollLeft))
      .toBeGreaterThan(0);
    await viewport.evaluate((element) => {
      element.scrollLeft = 0;
    });
    await page.getByRole("button", { name: "Add Transaction" }).click();
    const dialog = page.getByRole("dialog", { name: "Add Transaction" });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).not.toBeVisible();
  }
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`/${seeded.accountBookId}/accounts?tab=ASSET&mode=active`);
  await agGridRowByText(page, seeded.cashAccount.name).dblclick();
  await expect(page).toHaveURL(
    new RegExp(`/${seeded.accountBookId}/${seeded.cashAccount.id}`),
  );
});

test("ledger deep links scroll to an offscreen transaction and flash its cells", async ({
  page,
}) => {
  await Promise.all(
    Array.from({ length: 40 }, (_, index) =>
      seedThreeBookingSplitTransaction({
        accountBookId: seeded.accountBookId,
        description: `Scroll target ${index}`,
        currentAccountId: seeded.cashAccount.id,
        debitAccountIds: [seeded.savingsAccount.id, seeded.expenseAccount.id],
        date: new Date(Date.UTC(2026, 0, index + 1)).toISOString(),
      }),
    ),
  );
  const target = await prisma.transaction.findFirstOrThrow({
    where: {
      accountBookId: seeded.accountBookId,
      description: "Scroll target 0",
    },
  });
  // Record the transient flash even if it completes before an assertion runs.
  await page.addInitScript(() => {
    const observed = window as Window & { flashedTransaction?: boolean };
    new MutationObserver((records) => {
      for (const record of records) {
        const element = record.target;
        if (
          element instanceof HTMLElement &&
          element.classList.contains("ag-cell-data-changed") &&
          element.closest(".ag-row")?.textContent?.includes("Scroll target 0")
        ) {
          observed.flashedTransaction = true;
        }
      }
    }).observe(document, {
      subtree: true,
      attributes: true,
      attributeFilter: ["class"],
    });
  });
  await page.goto(
    `/${seeded.accountBookId}/${seeded.cashAccount.id}?transactionId=${target.id}`,
  );
  await expect(agGridRowByText(page, "Scroll target 0")).toBeVisible();
  await expect
    .poll(() =>
      page
        .locator(".ag-grid-viewport")
        .evaluate((element) => element.scrollTop),
    )
    .toBeGreaterThan(0);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as Window & { flashedTransaction?: boolean })
            .flashedTransaction,
      ),
    )
    .toBe(true);
});
