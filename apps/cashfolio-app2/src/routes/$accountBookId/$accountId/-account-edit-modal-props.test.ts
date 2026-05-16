import { describe, expect, test, vi } from "vitest";
import { AccountType, Unit } from "@/.prisma-client/enums";
import { createLedgerAccountEditModalProps } from "./-account-edit-modal-props";

describe("createLedgerAccountEditModalProps", () => {
  test("forwards account-book unit usage and selected account values", () => {
    const unitUsage = {
      currencies: ["CHF", "EUR", "USD"],
      cryptocurrencies: ["BTC", "ETH"],
    };
    const initialValues = {
      name: "Brokerage",
      type: AccountType.ASSET,
      equityAccountSubtype: null,
      groupId: "group-assets",
      sortOrder: 4,
      unit: Unit.CRYPTOCURRENCY,
      currency: null,
      cryptocurrency: "BTC",
      symbol: null,
      tradeCurrency: null,
      openingBalance: 0,
      hasBookings: true,
    };

    const props = createLedgerAccountEditModalProps({
      opened: true,
      onClose: vi.fn(),
      accountGroups: [],
      unitUsage,
      onSubmit: vi.fn(async () => undefined),
      initialValues,
      existingNodes: [],
      editingId: "account-brokerage",
      typeDescriptor: "ASSET",
    });

    expect(props.unitUsage).toBe(unitUsage);
    expect(props.unitUsage?.currencies).toEqual(["CHF", "EUR", "USD"]);
    expect(props.unitUsage?.cryptocurrencies).toEqual(["BTC", "ETH"]);
    expect(props.initialValues).toBe(initialValues);
    expect(props.initialValues?.cryptocurrency).toBe("BTC");
    expect(props.initialValues?.hasBookings).toBe(true);
    expect(props.editingId).toBe("account-brokerage");
  });
});
