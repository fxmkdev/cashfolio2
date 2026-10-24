import type {
  AccountType,
  EquityAccountSubtype,
} from "../../src/.prisma-client/enums";
import { createId } from "@paralleldrive/cuid2";
import { expect, test } from "../support/fixtures";
import { seedDatabase } from "../support/db";
import { prisma } from "../support/db-client";
import {
  agGridRowByText,
  clickRowAction,
  revealRowActions,
} from "../support/grid";

for (const tab of [
  "ASSET",
  "LIABILITY",
  "EQUITY-INCOME",
  "EQUITY-EXPENSE",
] as const) {
  test(`${tab}: Archived groups preserve hierarchy, actions, and ordering`, async ({
    page,
    e2eExternalId,
  }) => {
    const book = await seedDatabase({ userExternalId: e2eExternalId });
    const type: AccountType = tab.startsWith("EQUITY-")
      ? "EQUITY"
      : (tab as "ASSET" | "LIABILITY");
    const equityAccountSubtype: EquityAccountSubtype | null =
      tab === "EQUITY-INCOME"
        ? "INCOME"
        : tab === "EQUITY-EXPENSE"
          ? "EXPENSE"
          : null;
    const common = {
      accountBookId: book.accountBookId,
      type,
      equityAccountSubtype,
    };
    const live = await prisma.accountGroup.create({
      data: { ...common, id: createId(), name: "Z Live Group" },
    });
    const closed = await prisma.accountGroup.create({
      data: {
        ...common,
        id: createId(),
        name: "A Closed Group",
        parentGroupId: live.id,
        isActive: false,
      },
    });
    const accountFields = {
      ...common,
      ...(type !== "EQUITY"
        ? { unit: "CURRENCY" as const, currency: "CHF" }
        : {}),
    };
    await prisma.account.createMany({
      data: [
        {
          ...accountFields,
          id: createId(),
          name: "Z Live Account",
          groupId: live.id,
        },
        {
          ...accountFields,
          id: createId(),
          name: "A Closed Direct",
          groupId: live.id,
          isActive: false,
        },
        {
          ...accountFields,
          id: createId(),
          name: "A Closed Root",
          isActive: false,
        },
        {
          ...accountFields,
          id: createId(),
          name: "A Closed Leaf",
          groupId: closed.id,
          isActive: false,
        },
      ],
    });

    await page.goto(`/${book.accountBookId}/accounts?tab=${tab}&mode=archived`);
    const isCategory = type === "EQUITY";
    if (isCategory) {
      await expect(
        page.getByRole("checkbox", { name: "Show Archived" }),
      ).toBeChecked();
    } else {
      await expect(
        page.getByRole("heading", { name: "Accounts", exact: true }),
      ).toBeVisible();
    }
    await expect(
      page.getByRole("link", { name: "Archive", exact: true }),
    ).toHaveCount(0);
    if (!isCategory) {
      await expect(
        page.getByText(
          "Totals include active and archived accounts, including collapsed groups.",
        ),
      ).toBeVisible();
    }
    const rootArchive = page.locator('[row-id="__archived__:root"]');
    const groupArchive = page.locator(
      `[row-id="__archived__:group:${live.id}"]`,
    );
    await expect(rootArchive).toHaveAttribute("aria-expanded", "false");
    await expect(groupArchive).toHaveAttribute("aria-expanded", "false");
    await expect(agGridRowByText(page, "A Closed Group")).toHaveCount(0);
    const groupActionRow = await revealRowActions(groupArchive);
    await expect(
      groupActionRow.locator('[col-id="actions"] button'),
    ).toHaveCount(0);
    // Return the name column to view after checking the action column.
    await page.locator(".ag-grid-viewport").evaluate((element) => {
      element.scrollLeft = 0;
    });
    for (let sort = 0; sort < 2; sort += 1) {
      await page
        .getByRole("columnheader", { name: "Name", exact: true })
        .click();
      await expect
        .poll(
          async () =>
            Number(await rootArchive.getAttribute("row-index")) >
            Number(
              await agGridRowByText(page, live.name).getAttribute("row-index"),
            ),
        )
        .toBe(true);
      await expect
        .poll(
          async () =>
            Number(await groupArchive.getAttribute("row-index")) >
            Number(
              await agGridRowByText(page, "Z Live Account").getAttribute(
                "row-index",
              ),
            ),
        )
        .toBe(true);
    }
    await groupArchive.locator(".ag-group-contracted").click();
    const closedRow = agGridRowByText(page, closed.name);
    await expect(closedRow).toBeVisible();
    await closedRow.locator(".ag-group-contracted").click();
    const leaf = agGridRowByText(page, "A Closed Leaf");
    await expect(leaf).toBeVisible();
    await expect(
      page.locator(`[row-id="__archived__:group:${closed.id}"]`),
    ).toHaveCount(0);
    const leafActionRow = await revealRowActions(leaf);
    await expect(
      leafActionRow.getByRole("button", { name: "Unarchive" }),
    ).toBeDisabled();
    await clickRowAction(closedRow, "Edit");
    const dialog = page.getByRole("dialog").filter({
      has: page.getByRole("heading", {
        name: isCategory ? "Edit Category Group" : "Edit Group",
        exact: true,
      }),
    });
    await dialog.getByLabel("Name").fill("A Closed Renamed");
    await dialog.getByRole("button", { name: "Save", exact: true }).click();
    await expect(dialog).not.toBeVisible();
    expect(
      (
        await prisma.accountGroup.findUniqueOrThrow({
          where: {
            id_accountBookId: {
              id: closed.id,
              accountBookId: book.accountBookId,
            },
          },
        })
      ).parentGroupId,
    ).toBe(live.id);
    const renamed = agGridRowByText(page, "A Closed Renamed");
    await clickRowAction(renamed, "Reorder Siblings");
    const reorder = page.getByRole("dialog", {
      name: "Reorder Siblings",
      exact: true,
    });
    await expect(
      reorder.getByText("A Closed Direct", { exact: true }),
    ).toBeVisible();
    await expect(
      reorder.getByText("Z Live Account", { exact: true }),
    ).toHaveCount(0);
    await expect(reorder.getByText("Archived", { exact: true })).toHaveCount(0);
    await reorder.getByRole("button", { name: "Close", exact: true }).click();

    await page.reload();
    await expect(groupArchive).toHaveAttribute("aria-expanded", "true");
    await expect(rootArchive).toHaveAttribute("aria-expanded", "false");
    await clickRowAction(renamed, "Unarchive");

    await expect(renamed).toBeVisible();
    await expect(
      page.locator(`[row-id="__archived__:group:${closed.id}"]`),
    ).toHaveAttribute("aria-expanded", "false");
    await expect
      .poll(() =>
        prisma.accountGroup.findUniqueOrThrow({
          where: {
            id_accountBookId: {
              id: closed.id,
              accountBookId: book.accountBookId,
            },
          },
        }),
      )
      .toMatchObject({ isActive: true, parentGroupId: live.id });
  });
}
