import { describe, expect, test } from "vitest";
import { AccountType, Unit } from "../.prisma-client/enums";
import { ACCOUNT_TREE_SELECT_COLUMN, SELECT_COLUMN } from "./column-types";
import { createEditTransactionColumnDefs } from "./edit-transaction-modal-columns";
import type { AccountOption } from "./edit-transaction-modal-types";

const accounts: AccountOption[] = [
  {
    value: "account-checking",
    label: "Asset / Cash / Checking",
    treePath: ["Asset", "Cash"],
    treeLabel: "Checking",
    type: AccountType.ASSET,
    unit: Unit.CURRENCY,
    currency: "CHF",
  },
];

describe("createEditTransactionColumnDefs", () => {
  test("uses TreeSelect only for the booking account column", () => {
    const columnDefs = createEditTransactionColumnDefs({
      accounts,
      isSubmitting: false,
      accountBookStartDate: new Date("2026-01-04T00:00:00.000Z"),
    });

    expect(columnDefs.find((column) => column.field === "account")?.type).toBe(
      ACCOUNT_TREE_SELECT_COLUMN,
    );
    expect(columnDefs.find((column) => column.field === "unit")?.type).toBe(
      SELECT_COLUMN,
    );
    expect(columnDefs.find((column) => column.colId === "ccy")?.type).toBe(
      SELECT_COLUMN,
    );
  });
});
