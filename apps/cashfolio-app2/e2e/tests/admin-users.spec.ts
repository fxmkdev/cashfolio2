import { expect, test } from "@playwright/test";
import { UserRole } from "../../src/.prisma-client/enums";
import { seedDatabase } from "../support/db";
import { prisma } from "../support/db-client";

const targetUserExternalId = "e2e-admin-users-role-target";

test.beforeAll(async () => {
  await seedDatabase({ userRoles: [UserRole.ADMIN] });
  await prisma.user.upsert({
    where: { externalId: targetUserExternalId },
    update: { roles: [] },
    create: {
      externalId: targetUserExternalId,
      roles: [],
    },
  });
});

test("admin users page manages a user's Admin role from the row action dialog", async ({
  page,
}) => {
  await page.goto("/admin/users");

  await expect(page.getByRole("heading", { name: "Users" })).toBeVisible();

  const targetRow = page
    .locator(".ag-row")
    .filter({ hasText: targetUserExternalId });
  await expect(targetRow).toContainText("None");

  await targetRow.getByRole("button", { name: "Manage roles" }).click();

  const dialog = page.getByRole("dialog", { name: "Manage roles" });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText(targetUserExternalId);

  await dialog.getByText("Admin", { exact: true }).click();
  await expect(dialog.getByLabel("Admin")).toBeChecked();
  await dialog.getByRole("button", { name: "Save" }).click();

  await expect(dialog).toBeHidden();
  await expect(targetRow).toContainText("Admin");

  await expect
    .poll(async () => {
      const user = await prisma.user.findUnique({
        where: { externalId: targetUserExternalId },
        select: { roles: true },
      });
      return user?.roles ?? [];
    })
    .toEqual([UserRole.ADMIN]);
});
