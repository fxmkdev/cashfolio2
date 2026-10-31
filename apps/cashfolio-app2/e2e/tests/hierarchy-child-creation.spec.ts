import { createId } from "@paralleldrive/cuid2";
import { expect, test } from "../support/fixtures";
import { seedDatabase } from "../support/db";
import { prisma } from "../support/db-client";
import { agGridRowByText, clickPinnedRowAction } from "../support/grid";

for (const scope of ["BALANCE", "INCOME", "EXPENSE"] as const) {
  test(`creates contextual children under an active ${scope} group`, async ({
    page,
    e2eExternalId,
  }) => {
    const book = await seedDatabase({ userExternalId: e2eExternalId });
    const isCategory = scope !== "BALANCE";
    const parentId = createId();
    const parentName = `Contextual ${scope} parent`;
    await prisma.accountGroup.create({
      data: {
        id: parentId,
        name: parentName,
        accountBookId: book.accountBookId,
        type: isCategory ? "EQUITY" : "BALANCE",
        equityAccountSubtype: isCategory ? scope : null,
        isCashAccount: !isCategory,
      },
    });
    const route = isCategory
      ? `settings/categories?tab=EQUITY-${scope}`
      : "accounts";
    await page.goto(`/${book.accountBookId}/${route}`);
    const parent = agGridRowByText(page, parentName);
    const createLabel = isCategory
      ? `Add ${scope === "INCOME" ? "Income" : "Expense"} Category`
      : "Add Account";
    await clickPinnedRowAction({
      row: parent,
      actionLabel: `Add Child to ${parentName}`,
    });
    await page
      .getByRole("menuitem", { name: createLabel, exact: true })
      .click();
    let dialog = page.getByRole("dialog", {
      name: isCategory ? "New Category" : "New Account",
      exact: true,
    });
    await expect(
      dialog.getByLabel(isCategory ? "Category Group" : "Group", {
        exact: true,
      }),
    ).toHaveValue(parentName);
    if (!isCategory) {
      await expect(
        dialog.getByRole("combobox", { name: "Tracking Method", exact: true }),
      ).toHaveValue("Individual Units");
      await dialog
        .getByRole("combobox", { name: "Tracking Method", exact: true })
        .click();
      await page
        .getByRole("option", { name: "Total Portfolio Value", exact: true })
        .click();
      await dialog.getByRole("combobox", { name: "Currency" }).click();
      await page.getByRole("option", { name: /CHF/ }).first().click();
      await expect(
        dialog.getByRole("checkbox", { name: "Include in Cash Flow" }),
      ).toBeChecked();
      await expect(
        dialog.getByRole("checkbox", { name: "Include in Cash Flow" }),
      ).toBeDisabled();
    }
    await dialog.getByRole("textbox", { name: /^Name/ }).fill(`Child ${scope}`);
    await dialog.getByRole("button", { name: "Create", exact: true }).click();
    await expect(dialog).not.toBeVisible();
    const child = await prisma.account.findFirstOrThrow({
      where: { accountBookId: book.accountBookId, name: `Child ${scope}` },
    });
    expect(child.groupId).toBe(parentId);
    expect(child.isCashAccount).toBe(!isCategory);
    expect(child.trackingMethod).toBe(
      isCategory ? "INDIVIDUAL_UNITS" : "TOTAL_PORTFOLIO_VALUE",
    );
    expect(child.equityAccountSubtype).toBe(isCategory ? scope : null);
    // Successful contextual creation must not leak its parent into toolbar creation.
    await page.getByRole("button", { name: createLabel, exact: true }).click();
    dialog = page.getByRole("dialog", {
      name: isCategory ? "New Category" : "New Account",
      exact: true,
    });
    await expect(
      dialog.getByLabel(isCategory ? "Category Group" : "Group", {
        exact: true,
      }),
    ).toHaveValue("");
    if (!isCategory)
      await expect(
        dialog.getByRole("combobox", { name: "Tracking Method", exact: true }),
      ).toHaveValue("Individual Units");
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(dialog).not.toBeVisible();
    await clickPinnedRowAction({
      row: parent,
      actionLabel: `Add Child to ${parentName}`,
    });
    await page
      .getByRole("menuitem", { name: "Add Group", exact: true })
      .click();
    dialog = page.getByRole("dialog", {
      name: isCategory ? "New Category Group" : "New Group",
      exact: true,
    });
    await expect(
      dialog.getByLabel(isCategory ? "Parent Category Group" : "Parent Group", {
        exact: true,
      }),
    ).toHaveValue(parentName);
    await dialog
      .getByRole("textbox", { name: /^Name/ })
      .fill(`Child ${scope} group`);
    await dialog.getByRole("button", { name: "Create", exact: true }).click();
    await expect(dialog).not.toBeVisible();
    await page.reload();
    const childGroup = await prisma.accountGroup.findFirstOrThrow({
      where: {
        accountBookId: book.accountBookId,
        name: `Child ${scope} group`,
      },
    });
    expect(childGroup.parentGroupId).toBe(parentId);
    expect(childGroup.isCashAccount).toBe(!isCategory);
    const expander = agGridRowByText(page, parentName)
      .locator(".ag-group-contracted")
      .first();
    if (await expander.isVisible()) await expander.click();
    await expect(agGridRowByText(page, `Child ${scope} group`)).toBeVisible();
    await expect(
      page
        .locator(`.ag-grid-scrolling-container > .ag-row[row-id="${child.id}"]`)
        .getByRole("button", {
          name: /^Add Child/,
        }),
    ).toHaveCount(0);
  });
}
