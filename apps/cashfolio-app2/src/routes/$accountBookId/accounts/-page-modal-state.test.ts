import { describe, expect, test } from "vitest";
import { AccountType, Unit } from "@/.prisma-client/enums";
import type { TreeRow } from "./-page-types";
import { createAccountInitialValuesFromRow } from "./-page-modal-state";

describe("createAccountInitialValuesFromRow", () => {
  test("preserves booking lock state for account edit modals", () => {
    const row: TreeRow = {
      id: "account-1",
      nodeType: "account",
      name: "Brokerage",
      type: AccountType.ASSET,
      equityAccountSubtype: null,
      unit: Unit.SECURITY,
      currency: null,
      cryptocurrency: null,
      symbol: "AAPL",
      tradeCurrency: "USD",
      balance: 10,
      balanceInReferenceCurrency: 10,
      openingBalance: 2,
      hasBookings: true,
      parentId: "group-1",
      isActive: true,
      groupId: "group-1",
      sortOrder: 4,
      deletable: false,
      deleteDisabledReason: "Cannot delete account because it has bookings",
      archivable: true,
      archiveDisabledReason: undefined,
      unarchivable: false,
      unarchiveDisabledReason: "Account is active",
    };

    expect(createAccountInitialValuesFromRow(row)).toMatchObject({
      name: "Brokerage",
      unit: Unit.SECURITY,
      symbol: "AAPL",
      tradeCurrency: "USD",
      hasBookings: true,
    });
  });
});
