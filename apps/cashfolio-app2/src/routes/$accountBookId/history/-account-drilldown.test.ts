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
  { value: "unit-type:security", label: "Security", kind: "gainLoss" },
  { value: "unit:security:AAPL:USD", label: "AAPL", kind: "gainLoss" },
  {
    value: "unit-account:security:AAPL:USD:asset",
    label: "Asset",
    kind: "gainLoss",
    parentValue: "unit:security:AAPL:USD",
  },
  {
    value:
      "unit-account:security:AAPL:USD:virtual:transfer-clearing:account:security:AAPL:USD",
    label: "Clearing",
    kind: "gainLoss",
    parentValue: "unit:security:AAPL:USD",
  },
  { value: "explicit-account:cash", label: "Cash", kind: "gainLoss" },
];

describe("History account drill-down", () => {
  test.each([
    "cashFlow",
    "income",
    "expenses",
    "assets",
    "liabilities",
  ] as const)("opens %s account scopes in ledger", (metric) => {
    expect(
      resolveHistoryAccountDrillTarget({
        metric,
        scope: "account:expense",
        options,
        gainLossEquityAccountId: null,
      }),
    ).toEqual({ kind: "ledger", accountId: "expense" });
  });

  test.each([
    "total",
    "group:expenses",
    "account:missing",
    "account:virtual:transfer-clearing:account:currency:USD",
  ] as const)("does not navigate for unsupported scope %s", (scope) => {
    expect(
      resolveHistoryAccountDrillTarget({
        metric: "expenses",
        scope,
        options,
        gainLossEquityAccountId: null,
      }),
    ).toBeNull();
  });

  test.each(["totalReturn", "savings", "netWorth"] as const)(
    "does not navigate from unscoped metric %s",
    (metric) => {
      expect(
        resolveHistoryAccountDrillTarget({
          metric,
          scope: "account:expense",
          options,
          gainLossEquityAccountId: null,
        }),
      ).toBeNull();
    },
  );

  test("uses parent unit prefix and preserves virtual account IDs", () => {
    for (const accountId of [
      "asset",
      "virtual:transfer-clearing:account:security:AAPL:USD",
    ]) {
      expect(
        resolveHistoryAccountDrillTarget({
          metric: "gainsLosses",
          scope: `unit-account:security:AAPL:USD:${accountId}`,
          options,
          gainLossEquityAccountId: null,
        }),
      ).toEqual({ kind: "reconciliation", accountId });
    }
  });

  test.each([
    "total",
    "unit-type:security",
    "unit:security:AAPL:USD",
    "account:expense",
  ] as const)("rejects Gain/Loss aggregate scope %s", (scope) => {
    expect(
      resolveHistoryAccountDrillTarget({
        metric: "gainsLosses",
        scope,
        options,
        gainLossEquityAccountId: "gain-loss",
      }),
    ).toBeNull();
  });

  test("rejects unit account scopes with missing or mismatched parents or empty IDs", () => {
    for (const option of [
      { value: "unit-account:security:AAPL:USD:asset", parentValue: undefined },
      {
        value: "unit-account:security:AAPL:USD:asset",
        parentValue: "unit:fx:USD",
      },
      {
        value: "unit-account:security:AAPL:USD:",
        parentValue: "unit:security:AAPL:USD",
      },
    ] as const) {
      expect(
        resolveHistoryAccountDrillTarget({
          metric: "gainsLosses",
          scope: option.value,
          options: [{ ...option, label: "Asset", kind: "gainLoss" }],
          gainLossEquityAccountId: null,
        }),
      ).toBeNull();
    }
  });

  test("Explicit G/L uses the Gain/Loss ledger rather than the counterparty", () => {
    expect(
      resolveHistoryAccountDrillTarget({
        metric: "gainsLosses",
        scope: "explicit-account:cash",
        options,
        gainLossEquityAccountId: "gain-loss",
      }),
    ).toEqual({ kind: "ledger", accountId: "gain-loss" });
    expect(
      resolveHistoryAccountDrillTarget({
        metric: "gainsLosses",
        scope: "explicit-account:cash",
        options,
        gainLossEquityAccountId: null,
      }),
    ).toBeNull();
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
