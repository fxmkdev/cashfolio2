import { describe, expect, test } from "vitest";
import type { HistoryScopeOption } from "@/shared/history-scope";
import {
  buildHistoryAccountDrillNavigation,
  resolveHistoryAccountDrillTarget,
} from "./-account-drilldown";

const options: HistoryScopeOption[] = [
  { value: "total", label: "Total", kind: "total" },
  { value: "group:expenses", label: "Expenses", kind: "group" },
  { value: "account:expense", label: "Expense", kind: "account" },
  {
    value: "account:virtual:transfer-clearing:account:currency:USD",
    label: "Clearing",
    kind: "account",
  },
  { value: "asset-class:EQUITIES", label: "Security", kind: "gainLoss" },
  {
    value: "gain-loss-investment:EQUITIES:SECURITY:AAPL",
    label: "AAPL",
    kind: "gainLoss",
    parentValue: "asset-class:EQUITIES",
  },
  {
    value: "gain-loss-account:asset",
    label: "Asset",
    accountId: "asset",
    kind: "gainLoss",
    parentValue: "gain-loss-investment:EQUITIES:SECURITY:AAPL",
  },
  {
    value:
      "gain-loss-account:virtual:transfer-clearing:account:security:AAPL:USD",
    label: "Clearing",
    accountId: "virtual:transfer-clearing:account:security:AAPL:USD",
    kind: "gainLoss",
    parentValue: "gain-loss-investment:EQUITIES:SECURITY:AAPL",
  },
  {
    value: "gain-loss-account:cash",
    label: "Cash",
    kind: "gainLoss",
    accountId: "cash",
  },
];

describe("History account drill-down", () => {
  test("opens Account Structure G/L accounts in the same reconciliation as Asset Class", () => {
    expect(
      resolveHistoryAccountDrillTarget({
        metric: "gainsLosses",
        scope: "account:asset",
        options: [
          {
            value: "account:asset",
            accountId: "asset",
            label: "Asset",
            kind: "gainLoss",
            grouping: "accountStructure",
          },
        ],
      }),
    ).toEqual({ kind: "reconciliation", accountId: "asset" });
  });
  test.each(["cashFlow", "income", "expenses", "netWorth"] as const)(
    "opens %s account scopes in ledger",
    (metric) => {
      expect(
        resolveHistoryAccountDrillTarget({
          metric,
          scope: "account:expense",
          options,
        }),
      ).toEqual({ kind: "ledger", accountId: "expense" });
    },
  );

  test.each([
    "total",
    "group:expenses",
    "gain-loss-investment:EQUITIES:SECURITY:AAPL",
    "account:missing",
    "account:virtual:transfer-clearing:account:currency:USD",
  ] as const)("does not navigate for unsupported scope %s", (scope) => {
    expect(
      resolveHistoryAccountDrillTarget({
        metric: "netWorth",
        scope,
        options,
      }),
    ).toBeNull();
  });

  test.each(["totalReturn", "savings", "assets", "liabilities"] as const)(
    "does not navigate from unscoped metric %s",
    (metric) => {
      expect(
        resolveHistoryAccountDrillTarget({
          metric,
          scope: "account:expense",
          options,
        }),
      ).toBeNull();
    },
  );

  test("uses account metadata and preserves virtual account IDs", () => {
    for (const accountId of [
      "asset",
      "virtual:transfer-clearing:account:security:AAPL:USD",
    ]) {
      expect(
        resolveHistoryAccountDrillTarget({
          metric: "gainsLosses",
          scope: `gain-loss-account:${accountId}`,
          options,
        }),
      ).toEqual({ kind: "reconciliation", accountId });
    }
  });

  test.each([
    "total",
    "asset-class:EQUITIES",
    "asset-class:EQUITIES",
    "account:expense",
  ] as const)("rejects Gain/Loss aggregate scope %s", (scope) => {
    expect(
      resolveHistoryAccountDrillTarget({
        metric: "gainsLosses",
        scope,
        options,
      }),
    ).toBeNull();
  });

  test("rejects unit account scopes with missing or mismatched parents or empty IDs", () => {
    for (const option of [
      { value: "gain-loss-account:asset", parentValue: undefined },
      {
        value: "gain-loss-account:asset",
        parentValue: "unit:fx:USD",
      },
      {
        value: "gain-loss-account:",
        parentValue: "asset-class:EQUITIES",
      },
    ] as const) {
      expect(
        resolveHistoryAccountDrillTarget({
          metric: "gainsLosses",
          scope: option.value,
          options: [{ ...option, label: "Asset", kind: "gainLoss" }],
        }),
      ).toBeNull();
    }
  });

  test("recorded and mixed sources open the counterpart's unified explanation", () => {
    expect(
      resolveHistoryAccountDrillTarget({
        metric: "gainsLosses",
        scope: "gain-loss-account:cash",
        options,
      }),
    ).toEqual({ kind: "reconciliation", accountId: "cash" });
  });

  test.each(["ledger", "reconciliation"] as const)(
    "preserves month and year periods for %s",
    (kind) => {
      for (const periodValue of ["2026-01", "2026"]) {
        expect(
          buildHistoryAccountDrillNavigation({
            accountBookId: "book",
            target: { kind, accountId: "asset" },
            periodValue,
          }),
        ).toEqual({
          to:
            kind === "ledger"
              ? "/$accountBookId/$accountId"
              : "/$accountBookId/report/gains-losses/$accountId",
          params: { accountBookId: "book", accountId: "asset" },
          search: { period: periodValue },
        });
      }
    },
  );

  test.each(["opening-balance:2025-12-31", "bad-period"])(
    "rejects non-period datum %s",
    (periodValue) => {
      expect(
        buildHistoryAccountDrillNavigation({
          accountBookId: "book",
          target: { kind: "ledger", accountId: "asset" },
          periodValue,
        }),
      ).toBeNull();
    },
  );
});
