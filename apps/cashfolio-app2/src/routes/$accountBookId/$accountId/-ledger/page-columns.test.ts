import { describe, expect, test } from "vitest";
import { Unit } from "@/.prisma-client/enums";
import { buildCounterpartyLedgerSearch } from "./counterparty-ledger-search";
import {
  getLedgerCounterpartyAccountFilterValues,
  getLedgerBookingAmountDisplayValue,
  getLedgerUnitIdentifierDisplayValue,
} from "./page-columns";
import type { LedgerRow } from "./page-types";
import { getStatementImportBalanceHeaderName } from "../-statement-import/page-columns";

function createLedgerRow(args: {
  unit: Unit | null;
  currency?: string | null;
  cryptocurrency?: string | null;
  symbol?: string | null;
  debit?: number | null;
  credit?: number | null;
}): LedgerRow {
  return {
    id: "booking-1",
    transactionId: "transaction-1",
    bookingValue: args.debit ?? -(args.credit ?? 0),
    date: "01.01.2026",
    counterpartyAccounts: [],
    description: "Booking",
    unit: args.unit,
    currency: args.currency ?? null,
    cryptocurrency: args.cryptocurrency ?? null,
    symbol: args.symbol ?? null,
    tradeCurrency: null,
    isOpeningBalancesTransaction: false,
    debit: args.debit ?? null,
    credit: args.credit ?? null,
    referenceDebit: args.debit ?? null,
    referenceCredit: args.credit ?? null,
    balance: null,
    isVirtualCarryOver: false,
  };
}

describe("buildCounterpartyLedgerSearch", () => {
  test("includes the selected period when provided", () => {
    expect(
      buildCounterpartyLedgerSearch({
        transactionId: "tx-1",
        selectedPeriodValue: "2026-02",
      }),
    ).toEqual({
      transactionId: "tx-1",
      period: "2026-02",
    });
  });

  test("keeps period undefined when no period is selected", () => {
    expect(
      buildCounterpartyLedgerSearch({
        transactionId: "tx-1",
      }),
    ).toEqual({
      transactionId: "tx-1",
      period: undefined,
    });
  });
});

describe("getLedgerCounterpartyAccountFilterValues", () => {
  test("exposes visible account names for multi-account filters", () => {
    expect(
      getLedgerCounterpartyAccountFilterValues([
        { name: "Salary" },
        { name: "Broker" },
      ]),
    ).toEqual(["Salary", "Broker"]);
  });
});

describe("ledger reference-currency display values", () => {
  test("hides reference-currency unit and native amount cells for equity rows", () => {
    const row = createLedgerRow({
      unit: Unit.CURRENCY,
      currency: "CHF",
      debit: 100,
    });

    expect(
      getLedgerUnitIdentifierDisplayValue({
        data: row,
        referenceCurrency: "CHF",
      }),
    ).toBeNull();
    expect(
      getLedgerBookingAmountDisplayValue({
        data: row,
        hideReferenceCurrencyAmount: true,
        referenceCurrency: "CHF",
        value: row.debit,
      }),
    ).toBeNull();
  });

  test("keeps non-reference units visible for equity rows", () => {
    const row = createLedgerRow({
      unit: Unit.CURRENCY,
      currency: "USD",
      credit: 100,
    });

    expect(
      getLedgerUnitIdentifierDisplayValue({
        data: row,
        referenceCurrency: "CHF",
      }),
    ).toBe("USD");
    expect(
      getLedgerBookingAmountDisplayValue({
        data: row,
        hideReferenceCurrencyAmount: true,
        referenceCurrency: "CHF",
        value: row.credit,
      }),
    ).toBe(100);
  });

  test("keeps reference-currency native amount cells visible when no reference amount column is present", () => {
    const row = createLedgerRow({
      unit: Unit.CURRENCY,
      currency: "CHF",
      debit: 100,
    });

    expect(
      getLedgerBookingAmountDisplayValue({
        data: row,
        hideReferenceCurrencyAmount: false,
        referenceCurrency: "CHF",
        value: row.debit,
      }),
    ).toBe(100);
  });
});

describe("statement import balance column", () => {
  test("uses an implicit account-currency balance label", () => {
    expect(getStatementImportBalanceHeaderName()).toBe("Balance");
  });
});
