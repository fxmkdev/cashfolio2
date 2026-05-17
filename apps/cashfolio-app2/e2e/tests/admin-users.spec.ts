import { UserRole } from "../../src/.prisma-client/enums";
import { seedDatabase } from "../support/db";
import { prisma } from "../support/db-client";
import { expect, test } from "../support/fixtures";

let targetUserExternalId: string;

test.beforeAll(async ({ e2eExternalId }) => {
  targetUserExternalId = `${e2eExternalId}-role-target`;
  await seedDatabase({
    userExternalId: e2eExternalId,
    userRoles: [UserRole.ADMIN],
  });
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
  await page.setViewportSize({ width: 1600, height: 900 });
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

  const adminSwitch = dialog.getByRole("switch", { name: "Admin" });
  await adminSwitch.click();
  await expect(adminSwitch).toBeChecked();
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
