import { expect, test } from "../support/fixtures";
import {
  seedDatabase,
  seedExplicitGainLossDrilldownScenario,
} from "../support/db";
import { prisma } from "../support/db-client";
import {
  agGridRowByText,
  clickPinnedRowAction,
  scrollGridToRight,
} from "../support/grid";
import { selectClassificationOption } from "../support/classifications";
import { selectSegmentedControlOption } from "../support/segmented-control";
test("creates, assigns, reports, reparents and deletes an asset class", async ({
  page,
  e2eExternalId,
}) => {
  const book = await seedDatabase({
    userExternalId: e2eExternalId,
    accountBookStartDate: new Date("2026-01-01T00:00:00Z"),
  });
  await seedExplicitGainLossDrilldownScenario({
    accountBookId: book.accountBookId,
    counterAccountId: book.cashAccount.id,
  });
  await page.goto(
    `/${book.accountBookId}/settings/classifications?organize=true`,
  );
  await expect(page).not.toHaveURL(/organize=/);
  await expect(
    page.getByRole("tab", { name: "Asset Classes", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await expect(page).toHaveTitle(/Asset Classes/);
  await expect(
    page.getByRole("heading", { name: "Classifications", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Asset Class", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("treegrid", { name: "Asset Classes", exact: true }),
  ).toBeVisible();
  const organizer = page.getByRole("region", {
    name: "Asset Classes Hierarchy",
  });
  await organizer
    .getByRole("button", { name: "Move Other Assets", exact: true })
    .click();
  const move = page.getByRole("dialog", { name: "Move To…" });
  await selectSegmentedControlOption(
    move.getByRole("radiogroup", { name: "Position", exact: true }),
    "First",
  );
  await move.getByRole("button", { name: "Move", exact: true }).click();
  await expect(move).not.toBeVisible();
  await expect
    .poll(
      async () =>
        (
          await prisma.classificationNode.findMany({
            where: {
              accountBookId: book.accountBookId,
              schemeId: "assetClass",
              parentId: null,
            },
            orderBy: { sortOrder: "asc" },
          })
        )[0]?.id,
    )
    .toBe("OTHER_ASSETS");
  await page.reload();
  await expect(
    page.locator('.ag-grid-scrolling-container > .ag-row[row-index="0"]'),
  ).toHaveAttribute("row-id", "OTHER_ASSETS");
  await clickPinnedRowAction({
    row: page.locator('[row-id="EQUITIES"]').first(),
    actionLabel: "Add Child",
  });
  let dialog = page.getByRole("dialog", {
    name: "New Asset Class",
    exact: true,
  });
  await dialog.getByRole("textbox", { name: /^Name/ }).fill("Pension Equities");
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  const node = await prisma.classificationNode.findFirstOrThrow({
    where: { accountBookId: book.accountBookId, name: "Pension Equities" },
  });
  await page.goto(`/${book.accountBookId}/accounts`);
  const row = agGridRowByText(page, book.cashAccount.name);
  await clickPinnedRowAction({ row, actionLabel: "Edit" });
  dialog = page.getByRole("dialog", { name: "Edit Account", exact: true });
  await dialog.getByLabel("Asset Class", { exact: true }).click();
  await page
    .getByRole("option", { name: "Expand Equities", exact: true })
    .getByRole("button", { name: "Expand", exact: true })
    .click();
  await page
    .getByRole("option", { name: "Pension Equities", exact: true })
    .click();
  await expect(dialog.getByLabel("Asset Class", { exact: true })).toHaveValue(
    "Pension Equities",
  );
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await scrollGridToRight(page);
  await expect(row.locator('[col-id="assetClass"]')).toHaveText(
    "Equities / Pension Equities",
  );
  await page.goto(
    `/${book.accountBookId}/history?metric=gainsLosses&gainLossScope=asset-class:${node.id}`,
  );
  await expect
    .poll(() => new URL(page.url()).searchParams.get("gainLossScope"))
    .toBe(`asset-class:${node.id}`);
  await expect(page.getByRole("textbox", { name: "View" })).toHaveValue(
    "Pension Equities",
  );
  await page.goto(`/${book.accountBookId}/settings/classifications`);
  await organizer
    .getByRole("button", { name: "Move Pension Equities", exact: true })
    .click();
  dialog = page.getByRole("dialog", { name: "Move To…", exact: true });
  await dialog.getByLabel("Destination", { exact: true }).click();
  await selectClassificationOption(page, "Fixed Income");
  await dialog.getByRole("button", { name: "Move", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await page.goto(
    `/${book.accountBookId}/history?metric=gainsLosses&gainLossScope=asset-class:${node.id}`,
  );
  await expect(page.getByRole("textbox", { name: "View" })).toHaveValue(
    "Pension Equities",
  );
  await page.goto(`/${book.accountBookId}/settings/classifications`);
  await organizer
    .getByRole("button", { name: "Delete Pension Equities", exact: true })
    .click();
  dialog = page.getByRole("dialog", {
    name: "Delete Asset Class",
    exact: true,
  });
  await expect(dialog).toContainText("1 active and 0 archived");
  await dialog.getByLabel("Replacement Asset Class", { exact: true }).click();
  await page.getByRole("option", { name: "Unclassified", exact: true }).click();
  await dialog.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  expect(
    await prisma.accountClassification.count({
      where: {
        accountBookId: book.accountBookId,
        accountId: book.cashAccount.id,
        schemeId: "assetClass",
      },
    }),
  ).toBe(0);
  await page.goto(
    `/${book.accountBookId}/history?metric=gainsLosses&gainLossScope=asset-class:${node.id}`,
  );
  await expect
    .poll(() => new URL(page.url()).searchParams.get("gainLossScope"))
    .toBeNull();
});
