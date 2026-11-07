import Decimal from "decimal.js";
import { describe, expect, it } from "vitest";
import { toMoney } from "../../../shared/money";
import type { PeriodBaseData } from "../base-data/period-base-data-types";
import { isPeriodBaseDataCacheEntry } from "./period-base-data-cache-validation";

function snapshot(): PeriodBaseData {
  const instrument = {
    unit: "CURRENCY" as const,
    currency: "CHF",
    cryptocurrency: null,
    symbol: null,
    tradeCurrency: null,
  };
  const booking = {
    ...instrument,
    id: "booking",
    date: new Date("2026-01-02Z"),
    value: toMoney("0.123456789123456789"),
  };
  const account = {
    id: "account",
    name: "Cash",
    groupId: null,
    type: "BALANCE" as const,
    isCashAccount: true,
  };
  return {
    accountBookId: "book",
    periodValue: "2026",
    referenceCurrency: "CHF",
    selection: {
      periodValue: "2026",
      label: "2026",
      periodSpecifier: "year",
      granularity: "year",
      year: 2026,
      month: null,
      from: new Date("2026-01-01Z"),
      to: new Date("2026-12-31Z"),
      queryEndExclusive: new Date("2027-01-01Z"),
      initialHoldingDate: new Date("2025-12-31Z"),
      isBeforeAccountBookStart: false,
      minPeriodDate: new Date("2026-01-01Z"),
    },
    assetClasses: [{ id: "class", name: "Cash", parentId: null, sortOrder: 0 }],
    allAccountGroups: [{ id: "group", name: "Cash", parentGroupId: null }],
    baseAssetLiabilityAccounts: [
      {
        ...account,
        ...instrument,
        assetClassId: "class",
        trackingMethod: "INDIVIDUAL_UNITS",
      },
    ],
    holdingAccountsResolved: [{ id: "account", ...instrument }],
    endOfPeriodRawBalances: [{ accountId: "account", rawBalance: toMoney(1) }],
    initialHoldingBalances: [{ accountId: "account", rawBalance: toMoney(0) }],
    explicitCounterparts: [
      {
        transactionId: "transaction",
        accountId: "account",
        accountName: "Cash",
      },
    ],
    equityBookings: [
      {
        ...booking,
        accountId: "category",
        accountName: "Income",
        accountGroupId: null,
        equityAccountSubtype: "INCOME",
        transactionId: "transaction",
      },
    ],
    transferClearingUnitBuckets: [
      {
        ...instrument,
        unitKey: "CHF",
        unitLabel: "CHF",
        unitType: "currency",
        isNonReferenceUnit: false,
        rawBalance: toMoney(1),
        bookings: [
          {
            ...booking,
            originatingAccountIds: ["account"],
            description: null,
            transactionDescription: "Transfer",
            transactionId: "transaction",
          },
        ],
      },
    ],
    holdingTransactions: [
      {
        id: "transaction",
        bookings: [
          {
            ...booking,
            accountId: "account",
            accountType: "BALANCE",
            equityAccountSubtype: null,
          },
        ],
      },
    ],
    executionResidualTransactions: [
      {
        id: "transaction",
        bookings: [
          { ...booking, accountId: "account", account: { name: "Cash" } },
        ],
      },
    ],
    cashFlowTransactions: [
      { id: "transaction", bookings: [{ ...booking, account }] },
    ],
    hasCashAccounts: true,
  };
}

describe("period snapshot cache structure", () => {
  it("accepts complete snapshots with every calculation input and exact Decimal amounts", () => {
    expect(isPeriodBaseDataCacheEntry(snapshot())).toBe(true);
    const optional = snapshot();
    delete optional.assetClasses;
    delete optional.baseAssetLiabilityAccounts[0].trackingMethod;
    expect(isPeriodBaseDataCacheEntry(optional)).toBe(true);
  });

  it.each(Object.keys(snapshot()).filter((key) => key !== "assetClasses"))(
    "rejects missing required collection or metadata: %s",
    (key) => {
      const data = { ...snapshot() } as Record<string, unknown>;
      delete data[key];
      expect(isPeriodBaseDataCacheEntry(data)).toBe(false);
    },
  );

  it.each([
    ["equityBookings", "equityAccountSubtype", "UNKNOWN"],
    ["equityBookings", "date", "2026-01-02"],
    ["endOfPeriodRawBalances", "rawBalance", 1],
    ["baseAssetLiabilityAccounts", "trackingMethod", "UNKNOWN"],
    ["baseAssetLiabilityAccounts", "unit", "UNKNOWN"],
    ["baseAssetLiabilityAccounts", "type", "UNKNOWN"],
    ["assetClasses", "sortOrder", 0.5],
    ["transferClearingUnitBuckets", "unitType", "UNKNOWN"],
  ])("rejects malformed nested %s.%s", (collection, field, invalid) => {
    const data = snapshot();
    const entries = data[
      collection as keyof PeriodBaseData
    ] as unknown as Record<string, unknown>[];
    entries[0][field] = invalid;
    expect(isPeriodBaseDataCacheEntry(data)).toBe(false);
  });

  it("rejects malformed deeply nested account and booking data", () => {
    const data = snapshot();
    data.cashFlowTransactions[0].bookings[0].account.isCashAccount =
      "yes" as unknown as boolean;
    expect(isPeriodBaseDataCacheEntry(data)).toBe(false);
    const holding = snapshot();
    holding.holdingTransactions[0].bookings[0].value = new Decimal(NaN);
    expect(isPeriodBaseDataCacheEntry(holding)).toBe(false);
    const residual = snapshot();
    residual.executionResidualTransactions[0].bookings[0].account =
      null as unknown as { name: string };
    expect(isPeriodBaseDataCacheEntry(residual)).toBe(false);
  });
});
