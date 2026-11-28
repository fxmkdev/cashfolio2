import { Temporal } from "../../../shared/temporal";
import type { HistoryTask } from "../../valuation/history/types";
import type { HistoryBatch } from "../../valuation/history/provider.server";
import type { ReturnInputs } from "./return-engine.server";
import { account, booking } from "./return-test-support";

export function preStartReturnInputs(
  symbol: string,
  withFee: boolean,
): ReturnInputs {
  const stock = {
    unit: "SECURITY" as const,
    currency: null,
    symbol,
    tradeCurrency: "USD",
  };
  return {
    accounts: [account("stock", stock), account("eur", { currency: "EUR" })],
    groups: [
      { id: "group", name: "Investments", parentGroupId: null, isActive: true },
    ],
    classes: [
      { id: "equities", name: "Equities", parentId: null, sortOrder: 0 },
    ],
    transactions: [
      {
        bookings: [
          booking("stock-in", "2026-01-02", "1", {
            ...stock,
            accountId: "stock",
            transactionId: "purchase",
          }),
          booking("eur-out", "2025-12-31", withFee ? "-101" : "-100", {
            currency: "EUR",
            accountId: "eur",
            transactionId: "purchase",
          }),
          ...(withFee
            ? [
                booking("fee", "2026-01-02", "1", {
                  currency: "EUR",
                  accountId: "fee",
                  accountType: "EQUITY" as const,
                  equityAccountSubtype: "EXPENSE" as const,
                  transactionId: "purchase",
                }),
              ]
            : []),
        ],
      },
    ],
    initialBalances: new Map(),
    revision: "revision",
    referenceCurrency: "USD",
    startDate: "2026-01-01",
    asOfDate: "2026-01-04",
  };
}

export function preStartQuoteBatch(task: HistoryTask): HistoryBatch {
  const dates: string[] = [];
  for (
    let date = Temporal.PlainDate.from(task.from);
    date.toString() <= task.to;
    date = date.add({ days: 1 })
  )
    dates.push(date.toString());
  return {
    complete: true,
    points: Object.fromEntries(
      task.series.map((series) => [
        series.key,
        dates.flatMap((date) =>
          series.provider === "CURRENCYLAYER"
            ? [{ date, value: 0.8 }]
            : date < "2026-01-02"
              ? []
              : [{ date, value: date === "2026-01-02" ? 125 : 150 }],
        ),
      ]),
    ),
  };
}
