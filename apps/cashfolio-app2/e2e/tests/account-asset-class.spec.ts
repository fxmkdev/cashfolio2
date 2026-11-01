import {
  assetClassSelection,
  withAssetClassId,
} from "../../src/server/classification-data";
import { createId } from "@paralleldrive/cuid2";
import { seedDatabase, type SeededData } from "../support/db";
import { prisma } from "../support/db-client";
import { expect, test } from "../support/fixtures";
import {
  agGridCellByColId,
  agGridRowByText,
  clickRowAction,
  expandArchivedGroups,
} from "../support/grid";
import { openDialogFromButton } from "../support/ui";
import { selectClassificationOption } from "../support/classifications";

let seeded: SeededData;
test.beforeAll(async ({ e2eExternalId }) => {
  seeded = await seedDatabase({ userExternalId: e2eExternalId });
});

for (const type of ["BALANCE"] as const) {
  for (const isActive of [true, false]) {
    test(`${isActive ? "active" : "archived"} ${type} classification updates in the header and list`, async ({
      page,
    }) => {
      const account = await prisma.account
        .create({
          include: { classifications: assetClassSelection },
          data: {
            id: createId(),
            accountBookId: seeded.accountBookId,
            name: `${isActive ? "Active" : "Archived"} ${type} classification`,
            type,
            isActive,
            unit: "CURRENCY",
            currency: "CHF",
          },
        })
        .then(withAssetClassId);
      await page.goto(`/${seeded.accountBookId}/${account.id}`);
      await expect(
        page.getByTitle("Asset Class: Unclassified", { exact: true }),
      ).toHaveAttribute("data-variant", "outline");
      await page
        .getByRole("button", { name: "Edit", exact: true, disabled: false })
        .click();
      const dialog = page.getByRole("dialog", { name: "Edit Account" });
      await dialog.getByRole("textbox", { name: "Asset Class" }).click();
      const label = "Commodities & Precious Metals";
      await selectClassificationOption(page, label);
      await dialog.getByRole("button", { name: "Save", exact: true }).click();
      await expect(dialog).not.toBeVisible();
      const pill = page.getByTitle(`Asset Class: ${label}`, { exact: true });
      await expect(pill).toHaveAttribute("data-variant", "light");
      await page.setViewportSize({ width: 390, height: 844 });
      await expect(pill).toBeInViewport();
      await expect
        .poll(() =>
          page.evaluate(
            () =>
              document.documentElement.scrollWidth -
              document.documentElement.clientWidth,
          ),
        )
        .toBeLessThanOrEqual(1);
      await page.setViewportSize({ width: 1280, height: 900 });
      await page.goto(`/${seeded.accountBookId}/accounts?tab=${type}`);
      if (!isActive) {
        await expect(
          page.locator('[row-id^="__archived__:"]').first(),
        ).toBeVisible();
        await expandArchivedGroups(page);
      }
      const row = agGridRowByText(page, account.name);
      await expect(agGridCellByColId(row, "assetClass")).toHaveText(label);
      await expect(
        page.getByRole("columnheader", { name: "Name", exact: true }),
      ).toHaveAttribute("aria-colindex", "2");
      await expect(
        page.getByRole("columnheader", { name: "Asset Class", exact: true }),
      ).toHaveAttribute("aria-colindex", "6");
      expect(
        (
          await page
            .getByRole("columnheader", { name: "Name", exact: true })
            .boundingBox()
        )?.width,
      ).toBeGreaterThanOrEqual(320);
    });
  }
}

test("equity accounts have no classification column or ledger pill", async ({
  page,
}) => {
  for (const tab of ["EQUITY-INCOME", "EQUITY-EXPENSE"]) {
    await page.goto(`/${seeded.accountBookId}/accounts?tab=${tab}`);
    await expect(
      page.getByRole("columnheader", { name: "Name", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("columnheader", { name: "Asset Class", exact: true }),
    ).toHaveCount(0);
  }
  for (const account of [seeded.unitlessEquityAccount, seeded.expenseAccount]) {
    await page.goto(`/${seeded.accountBookId}/${account.id}`);
    await expect(
      page.getByRole("heading", { name: account.name, exact: true }),
    ).toBeVisible();
    await expect(page.locator('[title^="Asset Class:"]')).toHaveCount(0);
  }
});

test("manually classifies a currency portfolio from Accounts and clears it from its booked ledger", async ({
  page,
}) => {
  await page.goto(`/${seeded.accountBookId}/accounts?tab=ASSET`);
  const dialog = await openDialogFromButton(page, {
    buttonName: "Add Account",
    dialogName: "New Account",
  });
  const name = "Manually classified portfolio";
  await dialog.getByLabel("Name").fill(name);
  const assetClassId = dialog.getByRole("textbox", { name: "Asset Class" });
  await expect(assetClassId).toHaveValue("");
  await expect(assetClassId).toHaveAttribute("placeholder", "Unclassified");
  const unit = dialog.getByRole("combobox", { name: "Unit", exact: true });
  await unit.click();
  await page.getByRole("option", { name: "Security", exact: true }).click();
  await expect(assetClassId).toHaveValue("");
  await assetClassId.click();
  await selectClassificationOption(page, "Equities");
  await unit.click();
  await page.getByRole("option", { name: "Currency", exact: true }).click();
  await expect(assetClassId).toHaveValue("Equities");
  await dialog.getByRole("combobox", { name: "Currency", exact: true }).click();
  await page.getByRole("option", { name: "CHF" }).first().click();
  await dialog.getByLabel("Opening Balance").fill("50");
  await dialog.getByRole("button", { name: "Create", exact: true }).click();
  const row = agGridRowByText(page, name);
  await expect(row).toBeVisible();
  await expect(agGridCellByColId(row, "assetClass")).toHaveText("Equities");
  const classifiedTypography = await agGridCellByColId(
    row,
    "assetClass",
  ).evaluate((cell) => {
    const style = getComputedStyle(cell.firstElementChild ?? cell);
    return { fontSize: style.fontSize, color: style.color };
  });
  const nextCreate = await openDialogFromButton(page, {
    buttonName: "Add Account",
    dialogName: "New Account",
  });
  await expect(
    nextCreate.getByRole("textbox", { name: "Asset Class" }),
  ).toHaveValue("");
  await nextCreate.getByRole("button", { name: "Cancel", exact: true }).click();
  const account = await prisma.account
    .findFirstOrThrow({
      include: { classifications: assetClassSelection },
      where: { accountBookId: seeded.accountBookId, name },
    })
    .then(withAssetClassId);
  expect(account.assetClassId).toBe("EQUITIES");
  const bookings = await prisma.booking.findMany({
    where: { accountBookId: seeded.accountBookId, accountId: account.id },
    orderBy: { id: "asc" },
  });
  expect(bookings).toHaveLength(1);

  await clickRowAction(row, "Edit");
  const edit = page.getByRole("dialog", { name: "Edit Account" });
  await expect(
    edit.getByRole("combobox", { name: "Unit", exact: true }),
  ).toBeDisabled();
  await expect(edit.getByRole("textbox", { name: "Asset Class" })).toHaveValue(
    "Equities",
  );
  await edit.getByRole("textbox", { name: "Asset Class" }).click();
  await page.getByRole("option", { name: "Other Assets", exact: true }).click();
  await edit.getByRole("button", { name: "Save", exact: true }).click();
  await expect(edit).not.toBeVisible();
  await page
    .locator(".ag-grid-viewport")
    .first()
    .evaluate((element) => {
      element.scrollLeft = 0;
    });
  await expect(agGridCellByColId(row, "assetClass")).toHaveText("Other Assets");

  await page.goto(`/${seeded.accountBookId}/${account.id}`);
  await expect(
    page.getByTitle("Asset Class: Other Assets", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Edit", exact: true, disabled: false })
    .click();
  await expect(edit.getByRole("textbox", { name: "Asset Class" })).toHaveValue(
    "Other Assets",
  );
  await edit.getByRole("textbox", { name: "Asset Class" }).click();
  await page.getByRole("option", { name: "Unclassified", exact: true }).click();
  await edit.getByRole("button", { name: "Save", exact: true }).click();
  await expect(edit).not.toBeVisible();
  await expect(
    page.getByTitle("Asset Class: Unclassified", { exact: true }),
  ).toHaveAttribute("data-variant", "outline");
  await page.reload();
  await page
    .getByRole("button", { name: "Edit", exact: true, disabled: false })
    .click();
  await expect(edit.getByRole("textbox", { name: "Asset Class" })).toHaveValue(
    "",
  );
  const reloaded = await prisma.account
    .findUniqueOrThrow({
      include: { classifications: assetClassSelection },
      where: {
        id_accountBookId: {
          id: account.id,
          accountBookId: seeded.accountBookId,
        },
      },
    })
    .then(withAssetClassId);
  expect(reloaded).toMatchObject({
    assetClassId: null,
    unit: account.unit,
    currency: account.currency,
    isCashAccount: account.isCashAccount,
  });
  expect(
    await prisma.booking.findMany({
      where: { accountBookId: seeded.accountBookId, accountId: account.id },
      orderBy: { id: "asc" },
    }),
  ).toEqual(bookings);
  await edit.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.goto(`/${seeded.accountBookId}/accounts?tab=ASSET`);
  const unclassifiedCell = agGridCellByColId(
    agGridRowByText(page, name),
    "assetClass",
  );
  await expect(unclassifiedCell).toHaveText("Unclassified");
  const unclassifiedText = unclassifiedCell.getByText("Unclassified", {
    exact: true,
  });
  await expect(unclassifiedText).toHaveCSS(
    "font-size",
    classifiedTypography.fontSize,
  );
  await expect(unclassifiedText).not.toHaveCSS(
    "color",
    classifiedTypography.color,
  );
});
