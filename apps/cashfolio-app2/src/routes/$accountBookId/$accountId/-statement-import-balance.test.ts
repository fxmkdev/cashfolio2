import { describe, expect, it } from "vitest";
import { AccountType, Unit } from "@/.prisma-client/enums";
import type { StatementImportExistingBooking } from "@/server/statement-import";
import {
  getStatementImportGridRows,
  isStatementImportReviewDraftRow,
} from "./-statement-import-balance";
import {
  createStatementImportDraft,
  updateStatementImportDraftTransaction,
} from "./-statement-import";
import { matchStatementImportDrafts } from "./-statement-import-matching";
import { createRow, currentAccount } from "./-statement-import-test-fixtures";

const account = { ...currentAccount, type: AccountType.ASSET };
function draft(date: string, amount: string, row = 2) {
  return createStatementImportDraft({
    currentAccount,
    sourceRowNumber: row,
    row: createRow({ date, amount, description: `CSV ${row}` }),
  });
}
function booking(
  id: string,
  date: string,
  amount: string,
): StatementImportExistingBooking {
  return {
    id,
    transactionId: `tx-${id}`,
    date,
    amount,
    description: `Existing ${id}`,
  };
}
const opening = booking("opening", "2026-01-01", "100");
const existingId = (id: string) => `__statement_import_existing_booking__${id}`;

function summarize(rows: ReturnType<typeof getStatementImportGridRows>) {
  return rows.map(({ rowType, description, balance }) => ({
    rowType,
    description,
    balance,
  }));
}

describe("statement import chronological balances", () => {
  it("merges a partial import and unmatched account activity without including later bookings", () => {
    const history = [
      opening,
      booking("matched", "2026-02-02", "-10"),
      booking("manual", "2026-02-03", "5"),
      booking("later", "2026-02-10", "1000"),
    ];
    const drafts = matchStatementImportDrafts(
      [draft("2026-02-04", "-20"), draft("2026-02-02", "-10", 3)],
      history,
    );
    expect(
      summarize(
        getStatementImportGridRows({
          account,
          existingBookings: history,
          drafts,
        }),
      ),
    ).toEqual([
      { rowType: "draft", description: "CSV 2", balance: 75 },
      {
        rowType: "existingBooking",
        description: "Existing manual",
        balance: 95,
      },
      { rowType: "draft", description: "CSV 3", balance: 90 },
      {
        rowType: "balanceCarriedForward",
        description: "Balance carried forward",
        balance: 100,
      },
    ]);
  });

  it("shows historical balances on a fully matched reimport", () => {
    const history = [
      opening,
      booking("a", "2026-02-02", "-10"),
      booking("b", "2026-02-04", "-20"),
    ];
    const drafts = matchStatementImportDrafts(
      [draft("2026-02-04", "-20"), draft("2026-02-02", "-10", 3)],
      history,
    );
    const rows = getStatementImportGridRows({
      account,
      existingBookings: history,
      drafts,
    });
    expect(
      rows.filter(isStatementImportReviewDraftRow).map((row) => row.balance),
    ).toEqual([70, 90]);
    expect(rows.some((row) => row.rowType === "existingBooking")).toBe(false);
  });

  it("counts unmatched same-day bookings first and places matched bookings at their CSV positions", () => {
    const history = [
      opening,
      booking("match", "2026-02-02", "-10"),
      booking("manual", "2026-02-02", "5"),
    ];
    const drafts = matchStatementImportDrafts(
      [
        draft("2026-02-02", "-20"),
        draft("2026-02-02", "-10", 3),
        draft("2026-02-02", "2", 4),
      ],
      history,
    );
    const rows = getStatementImportGridRows({
      account,
      existingBookings: history,
      drafts,
    });
    expect(rows.map((row) => row.balance)).toEqual([77, 97, 107, 105, 100]);
    expect(rows.slice(0, 3).map((row) => row.id)).toEqual(
      drafts.map((row) => row.id),
    );
    expect(rows[3].id).toBe(existingId("manual"));
    const overridden = drafts.map((row) => ({ ...row, ignored: false }));
    expect(
      getStatementImportGridRows({
        account,
        existingBookings: history,
        drafts: overridden,
      }).map((row) => row.balance),
    ).toEqual([67, 87, 107, 105, 100]);
  });

  it("includes persisted bookings even when every candidate is ignored", () => {
    const drafts = [
      draft("2026-02-04", "-20"),
      draft("2026-02-02", "-10", 3),
    ].map((row) => ({ ...row, ignored: true }));
    const rows = getStatementImportGridRows({
      account,
      existingBookings: [opening, booking("manual", "2026-02-03", "5")],
      drafts,
    });
    expect(rows.map((row) => row.balance)).toEqual([105, 105, 100, 100]);
  });

  it.each([
    ["ascending", ["2026-02-01", "2026-02-02", "2026-02-03"]],
    ["descending", ["2026-02-03", "2026-02-02", "2026-02-01"]],
    ["mixed", ["2026-02-02", "2026-02-01", "2026-02-03"]],
  ])(
    "sorts %s CSV dates newest first without changing the drafts",
    (_label, dates) => {
      const drafts = dates.map((date, index) => draft(date, "10", index + 2));
      const rows = getStatementImportGridRows({
        account,
        existingBookings: [],
        drafts,
      });
      expect(rows.map((row) => row.date?.slice(0, 10))).toEqual([
        "2026-02-03",
        "2026-02-02",
        "2026-02-01",
      ]);
      expect(rows.map((row) => row.balance)).toEqual([30, 20, 10]);
      expect(drafts.map((row) => row.date.slice(0, 10))).toEqual(dates);
    },
  );

  it("uses inclusive review bounds and deterministic existing-booking order", () => {
    const history = [
      booking("z", "2026-02-03", "2"),
      booking("a", "2026-02-03", "1"),
      booking("before", "2026-02-02", "100"),
      booking("last", "2026-02-05", "3"),
      booking("after", "2026-02-06", "1000"),
    ];
    const drafts = [draft("2026-02-05", "10"), draft("2026-02-03", "10", 3)];
    const rows = getStatementImportGridRows({
      account,
      existingBookings: history,
      drafts,
    });
    expect(
      rows
        .filter((row) => row.rowType === "existingBooking")
        .map((row) => row.id),
    ).toEqual([existingId("last"), existingId("z"), existingId("a")]);
    expect(rows.map((row) => row.balance)).toEqual([
      126, 116, 113, 103, 101, 100,
    ]);
  });

  it("updates visible history and balances when an edited date clears matching", () => {
    const history = [
      opening,
      booking("match", "2026-02-02", "-10"),
      booking("manual", "2026-02-05", "5"),
    ];
    const drafts = matchStatementImportDrafts(
      [draft("2026-02-03", "-20"), draft("2026-02-02", "-10", 3)],
      history,
    );
    const transaction = structuredClone(drafts[1].transaction);
    transaction.bookings.forEach((booking) => {
      booking.date = "2026-02-06T00:00:00.000Z";
    });
    const edited = updateStatementImportDraftTransaction({
      draft: drafts[1],
      transaction,
    });
    expect(edited.matchedExistingBooking).toBeUndefined();
    expect(
      summarize(
        getStatementImportGridRows({
          account,
          existingBookings: history,
          drafts: [drafts[0], { ...edited, ignored: false }],
        }),
      ),
    ).toEqual([
      { rowType: "draft", description: "CSV 3", balance: 65 },
      {
        rowType: "existingBooking",
        description: "Existing manual",
        balance: 75,
      },
      { rowType: "draft", description: "CSV 2", balance: 70 },
      {
        rowType: "balanceCarriedForward",
        description: "Balance carried forward",
        balance: 90,
      },
    ]);
  });

  it("shows the original booking separately after an amount edit clears matching", () => {
    const history = [opening, booking("match", "2026-02-02", "-10")];
    const [matched] = matchStatementImportDrafts(
      [draft("2026-02-02", "-10")],
      history,
    );
    const transaction = structuredClone(matched.transaction);
    transaction.bookings[0].value = -15;
    const edited = updateStatementImportDraftTransaction({
      draft: matched,
      transaction,
    });
    const rows = getStatementImportGridRows({
      account,
      existingBookings: history,
      drafts: [{ ...edited, ignored: false }],
    });
    expect(rows.map((row) => row.balance)).toEqual([75, 90, 100]);
    expect(rows[1].id).toBe(existingId("match"));
  });

  it("uses each current-account booking's date and excludes other units and accounts", () => {
    const split = draft("2026-02-03", "10");
    split.transaction.bookings.push(
      {
        ...split.transaction.bookings[0],
        date: "2026-02-01T00:00:00.000Z",
        value: 5,
      },
      {
        ...split.transaction.bookings[0],
        date: "2026-02-04T00:00:00.000Z",
        value: 2,
      },
      { ...split.transaction.bookings[0], currency: "USD", value: 1000 },
    );
    const rows = getStatementImportGridRows({
      account,
      existingBookings: [],
      drafts: [draft("2026-02-05", "1", 3), split],
    });
    expect(rows.map((row) => row.balance)).toEqual([18, 15, 5]);
  });

  it("handles an edited candidate without a current-account booking as a balance marker", () => {
    const row = draft("2026-02-03", "10");
    row.transaction.bookings = row.transaction.bookings.filter(
      (booking) => booking.accountId !== currentAccount.id,
    );
    const rows = getStatementImportGridRows({
      account,
      existingBookings: [opening],
      drafts: [row],
    });
    expect(rows.map((row) => row.balance)).toEqual([100, 100]);
  });

  it("retains decimal precision and sign-adjusts liability balances", () => {
    const rows = getStatementImportGridRows({
      account: { ...account, type: AccountType.LIABILITY },
      existingBookings: [
        booking("opening", "2026-01-01", "-0.1"),
        booking("manual", "2026-02-02", "-0.2"),
      ],
      drafts: [draft("2026-02-02", "-0.3")],
    });
    expect(rows.map((row) => row.balance)).toEqual([0.6, 0.3, 0.1]);
    expect(rows[1].amount).toBe(-0.2);
  });

  it.each([
    { unit: Unit.CRYPTOCURRENCY, cryptocurrency: "BTC", value: 0.125 },
    { unit: Unit.SECURITY, symbol: "AAPL", tradeCurrency: "CHF", value: 2.5 },
  ])("calculates balances in the account's canonical unit: %j", (unit) => {
    const row = draft("2026-02-02", "1");
    Object.assign(row.transaction.bookings[0], unit);
    const rows = getStatementImportGridRows({
      account: { type: AccountType.ASSET, ...unit },
      existingBookings: [opening],
      drafts: [row],
    });
    expect(rows[0].balance).toBe(100 + unit.value);
  });

  it("identifies only draft rows as selectable and omits zero carried balances", () => {
    const rows = getStatementImportGridRows({
      account,
      existingBookings: [booking("manual", "2026-02-02", "2")],
      drafts: [draft("2026-02-02", "1")],
    });
    expect(rows.map(isStatementImportReviewDraftRow)).toEqual([true, false]);
    expect(isStatementImportReviewDraftRow(undefined)).toBe(false);
    expect(
      getStatementImportGridRows({
        account,
        existingBookings: [opening],
        drafts: [],
      }),
    ).toEqual([]);
  });
});
