import { describe, expect, it } from "vitest";
import { AccountType, Unit } from "@/.prisma-client/enums";
import type { StatementImportExistingBooking } from "@/server/statement-import";
import {
  createStatementImportDraft,
  updateStatementImportDraftTransaction,
  updateStatementImportDraftCounterAccount,
} from "./-statement-import";
import {
  createRow,
  currentAccount,
  getImportDraftStatus,
  accountOptions,
} from "./-statement-import-test-fixtures";
import { matchStatementImportDrafts } from "./-statement-import-matching";
import {
  getStatementImportIgnoredCount,
  getStatementImportTransactionsToSubmit,
  getStatementImportReviewRows,
  isStatementImportDisabled,
  setStatementImportDraftSelection,
} from "./-statement-import-page-controller";

function draft(
  description = "CSV description",
  row = 2,
  amount = "100.25",
  date = "2026-02-03",
) {
  return createStatementImportDraft({
    currentAccount,
    sourceRowNumber: row,
    row: createRow({ description, amount, date }),
  });
}
function booking(
  overrides: Partial<StatementImportExistingBooking> = {},
): StatementImportExistingBooking {
  return {
    id: "b1",
    transactionId: "t1",
    date: "2026-02-03",
    amount: "100.25",
    description: "Edited description",
    ...overrides,
  };
}

describe("statement import matching", () => {
  it("ignores a date and amount match with an edited description", () => {
    const [matched] = matchStatementImportDrafts([draft()], [booking()]);
    expect(matched).toMatchObject({
      ignored: true,
      matchedExistingBooking: { id: "b1", transactionId: "t1" },
    });
    expect(getImportDraftStatus(matched)).toMatchObject({
      kind: "ignored",
      label: "Already exists",
    });
    expect(getImportDraftStatus(matched).message).toContain("Check this row");
  });

  it("reserves exact descriptions before matching earlier unmatched descriptions", () => {
    const rows = [draft("Other", 2), draft("Same", 3), draft("Another", 4)];
    const result = matchStatementImportDrafts(rows, [
      booking({ description: "Same" }),
      booking({ id: "b2" }),
    ]);
    expect(result.map((row) => row.matchedExistingBooking?.id)).toEqual([
      "b2",
      "b1",
      undefined,
    ]);
    expect(result.map((row) => row.id)).toEqual(rows.map((row) => row.id));
  });

  it("matches repeated amounts one-to-one in source row order", () => {
    const result = matchStatementImportDrafts(
      [draft("Later", 3), draft("Earlier", 2), draft("Last", 4)],
      [booking()],
    );
    expect(result.map((row) => row.ignored)).toEqual([false, true, false]);
    expect(
      matchStatementImportDrafts([draft(), draft("Other", 3)], []).map(
        (row) => row.ignored,
      ),
    ).toEqual([false, false]);
    expect(matchStatementImportDrafts([], [booking()])).toEqual([]);
  });

  it.each([
    ["100.2500", "2026-02-03", true],
    ["100.25000000000001", "2026-02-03", false],
    ["-100.25", "2026-02-03", false],
    ["100.25", "2026-02-04", false],
    ["100.25", "2026-02-02T23:00:00Z", false],
    ["100.25", "2026-02-03T23:00:00Z", true],
  ])(
    "compares exact signed decimals and UTC days: %s %s",
    (amount, date, expected) => {
      expect(
        matchStatementImportDrafts([draft()], [booking({ amount, date })])[0]
          .ignored,
      ).toBe(expected);
    },
  );

  it("supports negative values and descriptions that are both blank", () => {
    expect(
      matchStatementImportDrafts(
        [draft("", 2, "-100.25")],
        [booking({ amount: "-100.250", description: "" })],
      )[0].ignored,
    ).toBe(true);
  });

  it("excludes matches from submitted transactions and balances but permits checkbox overrides", () => {
    const rows = matchStatementImportDrafts([draft()], [booking()]);
    expect(getStatementImportIgnoredCount(rows)).toBe(1);
    expect(getStatementImportTransactionsToSubmit(rows)).toEqual([]);
    expect(
      getStatementImportReviewRows({
        account: {
          type: AccountType.ASSET,
          unit: Unit.CURRENCY,
          currency: "CHF",
        },
        existingBookings: [
          booking({ id: "opening", date: "2026-01-01", amount: "99.75" }),
          booking(),
        ],
        drafts: rows,
      })[0].balance,
    ).toBe(200);
    expect(
      isStatementImportDisabled({
        drafts: rows,
        readyCount: 0,
        isSubmitting: false,
        isEditSubmitting: false,
      }),
    ).toBe(true);
    const included = setStatementImportDraftSelection({
      drafts: rows,
      selectedDraftIds: [rows[0].id],
    });
    expect(getImportDraftStatus(included[0]).kind).toBe("needs-edit");
    expect(getStatementImportTransactionsToSubmit(included)).toEqual([
      rows[0].transaction,
    ]);
    expect(
      getStatementImportReviewRows({
        account: {
          type: AccountType.ASSET,
          unit: Unit.CURRENCY,
          currency: "CHF",
        },
        existingBookings: [
          booking({ id: "opening", date: "2026-01-01", amount: "99.75" }),
          booking(),
        ],
        drafts: included,
      })[0].balance,
    ).toBe(300.25);
    const ready = updateStatementImportDraftCounterAccount({
      draft: included[0],
      selectedAccount: accountOptions[1],
    });
    expect(getImportDraftStatus(ready).kind).toBe("ready");
    expect(ready.matchedExistingBooking).toEqual(
      rows[0].matchedExistingBooking,
    );
  });

  it.each(["date", "value", "accountId", "currency", "extraBooking"])(
    "clears match metadata when the current booking changes: %s",
    (field) => {
      const [matched] = matchStatementImportDrafts([draft()], [booking()]);
      const transaction = structuredClone(matched.transaction);
      if (field === "date")
        transaction.bookings[0].date = "2026-02-04T00:00:00.000Z";
      if (field === "value") transaction.bookings[0].value = 110;
      if (field === "accountId")
        transaction.bookings[0].accountId = "asset-usd";
      if (field === "currency") transaction.bookings[0].currency = "USD";
      if (field === "extraBooking")
        transaction.bookings.push({ ...transaction.bookings[0] });
      expect(
        updateStatementImportDraftTransaction({ draft: matched, transaction })
          .matchedExistingBooking,
      ).toBeUndefined();
    },
  );

  it("retains match metadata after description or counter-booking edits", () => {
    const [matched] = matchStatementImportDrafts([draft()], [booking()]);
    const transaction = structuredClone(matched.transaction);
    transaction.description = "New description";
    transaction.bookings[1].value = -80;
    expect(
      updateStatementImportDraftTransaction({ draft: matched, transaction })
        .matchedExistingBooking,
    ).toEqual(matched.matchedExistingBooking);
  });
});
