import { generateStagingDataset } from "../../../staging-seed/dataset";
import { defaultAssetClassNodes } from "../../../shared/classification/asset-class";
import { toMoney } from "../../../shared/money";
import type { ReturnInputs, ReturnRateInput } from "./return-engine.server";

export function stagingReturnInputs(
  asOf = new Date("2026-11-07Z"),
  accountId?: string,
): ReturnInputs {
  const book = generateStagingDataset(new Date("2026-11-07Z")).books[0]!;
  const byId = new Map(book.accounts.map((a) => [a.key, a]));
  const initialBalances = new Map<string, ReturnType<typeof toMoney>>();
  for (const tx of book.transactions)
    for (const b of tx.bookings) {
      if (b.date < book.startDate && byId.get(b.accountKey)?.type === "BALANCE")
        initialBalances.set(
          b.accountKey,
          (initialBalances.get(b.accountKey) ?? toMoney(0)).plus(b.value),
        );
    }
  return {
    revision: "revision",
    referenceCurrency: book.referenceCurrency,
    startDate: book.startDate.toISOString().slice(0, 10),
    asOfDate: asOf.toISOString().slice(0, 10),
    initialBalances,
    accounts: book.accounts
      .filter((a) => a.type === "BALANCE")
      .map((a) => ({
        id: a.key,
        name: a.name,
        groupId: a.groupKey ?? null,
        isActive: a.isActive,
        assetClassId: a.assetClassId,
        trackingMethod: a.trackingMethod ?? "INDIVIDUAL_UNITS",
        unit: a.unit ?? "CURRENCY",
        currency: a.currency ?? null,
        cryptocurrency: a.cryptocurrency ?? null,
        symbol: a.symbol ?? null,
        tradeCurrency: a.tradeCurrency ?? null,
      })),
    groups: book.groups
      .filter((g) => g.type === "BALANCE")
      .map((g) => ({
        id: g.key,
        name: g.name,
        parentGroupId: g.parentKey ?? null,
        isActive: g.isActive,
      })),
    classes: defaultAssetClassNodes,
    transactions: book.transactions
      .map((tx, i) => ({
        bookings: tx.bookings.map((b) => ({
          ...b,
          id: `${i}:${b.sortOrder}`,
          transactionId: String(i),
          accountId: b.accountKey,
          accountType: byId.get(b.accountKey)?.type ?? "EQUITY",
          equityAccountSubtype:
            byId.get(b.accountKey)?.equityAccountSubtype ??
            (b.accountKey === "gain-loss" ? "GAIN_LOSS" : null),
          value: toMoney(b.value),
          currency: b.currency ?? null,
          cryptocurrency: b.cryptocurrency ?? null,
          symbol: b.symbol ?? null,
          tradeCurrency: b.tradeCurrency ?? null,
        })),
      }))
      .filter(
        (tx) =>
          (!accountId || tx.bookings.some((b) => b.accountId === accountId)) &&
          tx.bookings.some((b) => b.date >= book.startDate) &&
          tx.bookings.some((b) => b.date <= asOf),
      ),
  };
}

export const stagingReturnRate = (input: ReturnRateInput) =>
  toMoney(
    input.unit === "SECURITY"
      ? 100
      : input.unit === "CRYPTOCURRENCY"
        ? 10000
        : input.currency === "USD"
          ? "0.9"
          : input.currency === "EUR"
            ? "0.95"
            : 1,
  );

import { account, cash } from "./return-test-support";
export function groupingReturnInputs(): ReturnInputs {
  return {
    accounts: [
      account(),
      account("cash", { currency: "CHF" }),
      account("archived", {
        currency: "CHF",
        isActive: false,
        trackingMethod: "TOTAL_PORTFOLIO_VALUE",
      }),
    ],
    groups: [
      { id: "group", name: "Group", parentGroupId: null, isActive: true },
    ],
    classes: [
      { id: "equities", name: "Equities", parentId: null, sortOrder: 0 },
    ],
    transactions: [
      {
        bookings: [
          cash("adjusted", "2026-03-01", "10", { accountId: "archived" }),
          cash("gain", "2026-03-01", "-10", {
            accountType: "EQUITY",
            accountId: "equity",
            equityAccountSubtype: "GAIN_LOSS",
          }),
        ],
      },
    ],
    initialBalances: new Map([
      ["a", toMoney(100)],
      ["cash", toMoney(100)],
      ["archived", toMoney(100)],
    ]),
    revision: "revision",
    startDate: "2026-01-01",
    asOfDate: "2026-11-07",
    referenceCurrency: "CHF",
  };
}
