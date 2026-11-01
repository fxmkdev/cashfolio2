import { createId } from "@paralleldrive/cuid2";
import { expect, test } from "../support/fixtures";
import { seedDatabase } from "../support/db";
import { prisma } from "../support/db-client";
import { selectClassificationOption } from "../support/classifications";
import {
  agGridRowByText,
  clickGridRowSelectionCheckbox,
  clickRowAction,
} from "../support/grid";

for (const entry of ["account", "ledger", "bulk"] as const) {
  test(`${entry} assignment refreshes stale class choices without losing the draft`, async ({
    page,
    e2eExternalId,
  }) => {
    const book = await seedDatabase({ userExternalId: e2eExternalId });
    const temporaryId = createId();
    const temporaryLabel = "Temporary Sector";
    await prisma.classificationNode.create({
      data: {
        id: temporaryId,
        accountBookId: book.accountBookId,
        schemeId: "assetClass",
        name: temporaryLabel,
        parentId: null,
        sortOrder: 9,
      },
    });
    await page.goto(
      `/${book.accountBookId}/${entry === "ledger" ? book.cashAccount.id : "accounts"}`,
    );
    if (entry === "ledger") {
      await page.getByRole("button", { name: "Edit", exact: true }).click();
    } else {
      const row = agGridRowByText(page, book.cashAccount.name);
      if (entry === "bulk") {
        await clickGridRowSelectionCheckbox(row);
        await page
          .getByRole("button", { name: "Set Asset Class", exact: true })
          .click();
      } else {
        await clickRowAction(row, "Edit");
      }
    }
    const dialog = page.getByRole("dialog", {
      name: entry === "bulk" ? "Set Asset Class" : "Edit Account",
      exact: true,
    });
    const draftName = `Preserved ${entry} draft`;
    if (entry !== "bulk")
      await dialog.getByRole("textbox", { name: /^Name/ }).fill(draftName);
    const selector = dialog.getByRole("textbox", {
      name: "Asset Class",
      exact: true,
    });
    await selector.click();
    await selectClassificationOption(page, temporaryLabel);
    // Simulate another client's taxonomy edit after this dialog loaded its choices.
    const replacementId = createId();
    await prisma.classificationNode.create({
      data: {
        id: replacementId,
        accountBookId: book.accountBookId,
        schemeId: "assetClass",
        name: "New Sector",
        parentId: null,
        sortOrder: 10,
      },
    });
    await prisma.classificationNode.delete({
      where: {
        id_schemeId_accountBookId: {
          id: temporaryId,
          accountBookId: book.accountBookId,
          schemeId: "assetClass",
        },
      },
    });
    const submit = dialog.getByRole("button", {
      name: entry === "bulk" ? "Apply" : "Save",
      exact: true,
    });
    await submit.click();
    await expect(dialog.getByRole("alert")).toContainText(
      "no longer available",
    );
    await expect(submit).toBeEnabled();
    if (entry !== "bulk")
      await expect(dialog.getByRole("textbox", { name: /^Name/ })).toHaveValue(
        draftName,
      );
    await selector.click();
    await expect(
      page.getByRole("option", {
        name: `${temporaryLabel} (no longer available)`,
        exact: true,
      }),
    ).toHaveAttribute("aria-disabled", "true");
    await selector.fill("");
    await expect(
      page.getByRole("option", { name: temporaryLabel, exact: true }),
    ).toHaveCount(0);
    await selectClassificationOption(page, "New Sector");
    await submit.click();
    await expect(dialog).not.toBeVisible();
    const assignment = await prisma.accountClassification.findUniqueOrThrow({
      where: {
        accountId_schemeId_accountBookId: {
          accountId: book.cashAccount.id,
          accountBookId: book.accountBookId,
          schemeId: "assetClass",
        },
      },
    });
    expect(assignment.nodeId).toBe(replacementId);
    if (entry !== "bulk") {
      const account = await prisma.account.findUniqueOrThrow({
        where: {
          id_accountBookId: {
            id: book.cashAccount.id,
            accountBookId: book.accountBookId,
          },
        },
      });
      expect(account.name).toBe(draftName);
    }
  });
}
