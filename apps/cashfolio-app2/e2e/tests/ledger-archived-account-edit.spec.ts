import { createClassifiedAccounts } from "../support/classifications";
import {
  assetClassSelection,
  withAssetClassId,
} from "../../src/server/classification-data";
import { createId } from "@paralleldrive/cuid2";
import { seedDatabase, type SeededData } from "../support/db";
import { prisma } from "../support/db-client";
import { expect, test } from "../support/fixtures";

let seeded: SeededData;

test.beforeAll(async ({ e2eExternalId }) => {
  seeded = await seedDatabase({ userExternalId: e2eExternalId });
});

for (const scenario of [
  "nested archived groups",
  "an active parent",
  "no group",
] as const) {
  test(`edit an archived ledger account with ${scenario}`, async ({ page }) => {
    const accountBookId = seeded.accountBookId;
    let groupId: string | null = null;
    let groupName = "";
    if (scenario !== "no group") {
      const parent = await prisma.accountGroup.create({
        data: {
          id: createId(),
          accountBookId,
          name: `Ledger parent for ${scenario}`,
          type: "BALANCE",
          isActive: scenario === "an active parent",
        },
      });
      const group =
        scenario === "nested archived groups"
          ? await prisma.accountGroup.create({
              data: {
                id: createId(),
                accountBookId,
                name: "Archived bank accounts",
                type: "BALANCE",
                isActive: false,
                parentGroupId: parent.id,
              },
            })
          : parent;
      groupId = group.id;
      groupName = group.name;
    }
    const accountId = createId();
    const accountName = `Archived account with ${scenario}`;
    const siblingName = `Archived sibling with ${scenario}`;
    await createClassifiedAccounts(
      prisma,
      [accountName, siblingName].map((name, index) => ({
        id: index === 0 ? accountId : createId(),
        accountBookId,
        name,
        groupId,
        type: "BALANCE" as const,
        unit: "CURRENCY" as const,
        currency: "CHF",
        isActive: false,
      })),
    );

    await page.goto(`/${accountBookId}/${accountId}`);
    await page.getByRole("button", { name: "Edit", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Edit Account" });
    const groupInput = dialog.getByLabel("Group", { exact: true });
    await expect(groupInput).toHaveValue(groupName);
    await expect(groupInput).not.toHaveAttribute("aria-invalid", "true");
    await expect(dialog.getByText(/no longer available/)).toHaveCount(0);

    const nameInput = dialog.getByLabel("Name");
    await nameInput.fill(siblingName);
    await dialog.getByRole("button", { name: "Save", exact: true }).click();
    await expect(nameInput).toHaveAttribute("aria-invalid", "true");
    await expect(
      dialog.getByText(
        "An account with this name already exists in this group",
      ),
    ).toBeVisible();

    const updatedName = `${accountName} updated`;
    await nameInput.fill(updatedName);
    await expect(
      dialog.getByRole("combobox", { name: "Unit", exact: true }),
    ).toBeDisabled();
    const assetClassInput = dialog.getByRole("textbox", {
      name: "Asset Class",
    });
    await expect(assetClassInput).toBeEnabled();
    await assetClassInput.click();
    await page
      .getByRole("option", { name: "Real Estate", exact: true })
      .click();
    await dialog.getByRole("button", { name: "Save", exact: true }).click();
    await expect(dialog).not.toBeVisible();
    await expect(
      page.getByRole("heading", { name: updatedName }),
    ).toBeVisible();

    await page.reload();
    await expect(
      page.getByRole("heading", { name: updatedName }),
    ).toBeVisible();
    await expect(page.getByText("Archived", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Edit", exact: true }).click();
    await expect(groupInput).toHaveValue(groupName);
    await expect(assetClassInput).toHaveValue("Real Estate");
    await expect(dialog.getByText(/no longer available/)).toHaveCount(0);
    await expect(
      prisma.account
        .findUniqueOrThrow({
          where: { id_accountBookId: { id: accountId, accountBookId } },
          select: {
            classifications: assetClassSelection,
            name: true,
            groupId: true,
            isActive: true,
          },
        })
        .then(withAssetClassId),
    ).resolves.toEqual({
      name: updatedName,
      groupId,
      isActive: false,
      assetClassId: "REAL_ESTATE",
    });
  });
}
