import { describe, expect, it } from "vitest";
import {
  AccountType,
  EquityAccountSubtype,
  Unit,
} from "../.prisma-client/enums";
import {
  getBulkRebookTargetOptions,
  getBulkTransactionIds,
  isBulkActionRowSelectable,
} from "./bulk-transaction-actions";

const row = {
  id: "booking",
  transactionId: "transaction",
  isOpeningBalancesTransaction: false,
};
const booking = {
  id: "booking",
  bookingValue: 10,
  unit: Unit.CURRENCY,
  currency: "CHF",
  cryptocurrency: null,
  symbol: null,
  tradeCurrency: null,
};
const account = {
  value: "target",
  label: "Target",
  type: AccountType.BALANCE,
  equityAccountSubtype: null,
  unit: Unit.CURRENCY,
  currency: "CHF",
  cryptocurrency: null,
  symbol: null,
  tradeCurrency: null,
};

describe("bulk transaction selection", () => {
  it("excludes protected, virtual, and missing rows", () => {
    expect(isBulkActionRowSelectable(row)).toBe(true);
    expect(isBulkActionRowSelectable(undefined)).toBe(false);
    expect(
      isBulkActionRowSelectable({ ...row, isOpeningBalancesTransaction: true }),
    ).toBe(false);
    expect(
      isBulkActionRowSelectable({ ...row, isVirtualCarryOver: true }),
    ).toBe(false);
  });
  it("deduplicates transactions from selected bookings", () => {
    expect(
      getBulkTransactionIds([
        row,
        { ...row, id: "second" },
        { ...row, transactionId: "other" },
      ]),
    ).toEqual(["transaction", "other"]);
  });
});

describe("common rebook targets", () => {
  const options = [
    account,
    { ...account, value: "current" },
    { ...account, value: "usd", currency: "USD" },
    {
      ...account,
      value: "opening",
      type: AccountType.EQUITY,
      equityAccountSubtype: EquityAccountSubtype.OPENING_BALANCES,
    },
    {
      ...account,
      value: "expense",
      type: AccountType.EQUITY,
      equityAccountSubtype: EquityAccountSubtype.EXPENSE,
    },
    {
      ...account,
      value: "income",
      type: AccountType.EQUITY,
      equityAccountSubtype: EquityAccountSubtype.INCOME,
    },
  ];
  const targets = (bookings = [booking]) =>
    getBulkRebookTargetOptions({
      bookings,
      currentAccountId: "current",
      accountOptions: options,
    });
  it("requires compatibility with every booking's sign and unit", () => {
    expect(targets().map((a) => a.value)).toEqual(["target", "expense"]);
    expect(
      targets([booking, { ...booking, bookingValue: -10 }]).map((a) => a.value),
    ).toEqual(["target"]);
    expect(targets([booking, { ...booking, currency: "USD" }])).toEqual([]);
  });
  it("offers no accounts for empty selections or incomplete booking metadata", () => {
    expect(targets([])).toEqual([]);
    expect(
      getBulkRebookTargetOptions({
        bookings: [{ ...booking, unit: null }],
        currentAccountId: "current",
        accountOptions: options,
      }),
    ).toEqual([]);
    expect(
      getBulkRebookTargetOptions({
        bookings: [{ ...booking, currency: null }],
        currentAccountId: "current",
        accountOptions: options,
      }),
    ).toEqual([]);
  });
  it("permits mixed booking units in a compatible unitless equity target", () => {
    const unitless = {
      ...account,
      unit: null,
      type: AccountType.EQUITY,
      equityAccountSubtype: EquityAccountSubtype.EXPENSE,
    };
    expect(
      getBulkRebookTargetOptions({
        bookings: [booking, { ...booking, currency: "USD" }],
        currentAccountId: "current",
        accountOptions: [unitless],
      }),
    ).toEqual([unitless]);
  });
});
