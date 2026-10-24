import { describe, expect, it } from "vitest";
import {
  createLedgerReturnTarget,
  getLedgerReturnDelta,
  parseLedgerReturnTarget,
} from "./ledger-navigation";

describe("ledger return navigation", () => {
  it.each([
    ["/book/report?period=2026-01#income", "Report"],
    ["/book/report/gains-losses/cash?period=2026", "Report"],
    ["/book/history?metric=expenses", "History"],
    ["/book/transactions?period=2026", "Transactions"],
    [
      "/book/settings/categories?tab=EQUITY-EXPENSE&showArchived=true",
      "Categories",
    ],
    ["/book/accounts?tab=LIABILITY", "Accounts"],
    ["/book/cash?period=2026-01", "Checking"],
  ])("captures the immediate source %s", (href, label) => {
    expect(
      createLedgerReturnTarget({
        accountBookId: "book",
        href,
        ledgerName: "Checking",
        historyIndex: 2,
      }),
    ).toEqual({ href, label, historyIndex: 2 });
  });

  it.each([
    "https://evil.example/book/report",
    "//evil.example/book/report",
    "/other/report",
    "/book/settings",
    "/book/user-settings",
    "/book/cash/import-statement",
    "/book/../other/report",
    "/book/\\evil",
  ])("rejects unsupported source %s", (href) => {
    expect(
      createLedgerReturnTarget({
        accountBookId: "book",
        href,
        ledgerName: "Checking",
      }),
    ).toBeNull();
  });

  it("omits return context for direct visits or missing ledger names", () => {
    expect(parseLedgerReturnTarget(undefined, "book")).toBeNull();
    expect(
      parseLedgerReturnTarget({ href: 1, label: "Report" }, "book"),
    ).toBeNull();
    expect(
      createLedgerReturnTarget({ accountBookId: "book", href: "/book/cash" }),
    ).toBeNull();
    expect(
      createLedgerReturnTarget({
        accountBookId: "book",
        href: "/book/constructor",
      }),
    ).toBeNull();
  });

  it("validates stored state and recomputes section labels", () => {
    expect(
      parseLedgerReturnTarget(
        { href: "/book/report?period=2026", label: "Wrong", historyIndex: -1 },
        "book",
      ),
    ).toEqual({ href: "/book/report?period=2026", label: "Report" });
  });

  it("returns to the source past intervening period changes", () => {
    expect(
      getLedgerReturnDelta(
        { href: "/book/report", label: "Report", historyIndex: 2 },
        5,
      ),
    ).toBe(-3);
  });

  it.each([undefined, 0, 2, 1.5])(
    "falls back to the source URL when index %s is unusable",
    (index) => {
      expect(
        getLedgerReturnDelta(
          { href: "/book/report", label: "Report", historyIndex: 2 },
          index,
        ),
      ).toBeNull();
      expect(
        getLedgerReturnDelta({ href: "/book/report", label: "Report" }, index),
      ).toBeNull();
    },
  );
});
