import { describe, expect, test } from "vitest";
import { createStatementImportDraft } from "../index";
import {
  accountOptions,
  createRow,
  currentAccount,
  getImportDraftStatus,
} from "../test-fixtures";
import {
  updateStatementImportDraftCounterAccount,
  updateStatementImportDraftTransaction,
} from "../index";

describe("statement import draft status", () => {
  test("maps negative statement amounts to credit current-account bookings", () => {
    const draft = createStatementImportDraft({
      row: createRow({ amount: "-45.10", "original amount": "42.00" }),
      sourceRowNumber: 2,
      currentAccount,
    });

    expect(draft.transaction.bookings).toMatchObject([
      { accountId: "asset-1", value: -45.1 },
      { accountId: "", currency: "EUR", value: 42 },
    ]);
  });

  test("marks drafts as needing a counter account before import", () => {
    const draft = createStatementImportDraft({
      row: createRow(),
      sourceRowNumber: 2,
      currentAccount,
    });

    expect(getImportDraftStatus(draft)).toMatchObject({
      kind: "needs-edit",
      message: "Counter account is required.",
    });
  });

  test("marks ignored drafts as ignored before validating edits", () => {
    const draft = createStatementImportDraft({
      row: createRow(),
      sourceRowNumber: 2,
      currentAccount,
    });

    expect(getImportDraftStatus({ ...draft, ignored: true })).toMatchObject({
      kind: "ignored",
      label: "Ignored",
      message: "This row will not be imported.",
    });
  });

  test("validates same-currency drafts before import", () => {
    const draft = createStatementImportDraft({
      row: createRow({
        amount: "100.00",
        "original amount": "90.00",
        "original currency": "CHF",
      }),
      sourceRowNumber: 2,
      currentAccount,
    });
    draft.transaction.bookings[1] = {
      ...draft.transaction.bookings[1],
      accountId: "income-1",
    };

    expect(getImportDraftStatus(draft)).toMatchObject({
      kind: "error",
      message: "The sum of all bookings must be zero.",
    });

    draft.transaction.bookings[1] = {
      ...draft.transaction.bookings[1],
      value: -100,
    };
    expect(getImportDraftStatus(draft).kind).toBe("ready");
  });

  test("marks drafts before the account book start date as invalid", () => {
    const draft = createStatementImportDraft({
      row: createRow({ date: "2025-12-31" }),
      sourceRowNumber: 2,
      currentAccount,
    });
    const updated = updateStatementImportDraftCounterAccount({
      draft,
      selectedAccount: accountOptions.find(
        (account) => account.value === "income-1",
      ),
    });

    expect(getImportDraftStatus(updated)).toMatchObject({
      kind: "error",
      message:
        "Booking 1: Date cannot be before account book start date (2026-01-01).",
    });
  });

  test("drafts are not ready when edits remove the current ledger account booking", () => {
    const draft = createStatementImportDraft({
      row: createRow(),
      sourceRowNumber: 2,
      currentAccount,
    });
    const withCounterAccount = updateStatementImportDraftCounterAccount({
      draft,
      selectedAccount: accountOptions.find(
        (account) => account.value === "income-1",
      ),
    });
    const withoutCurrentAccount = updateStatementImportDraftTransaction({
      draft: withCounterAccount,
      transaction: {
        ...withCounterAccount.transaction,
        bookings: withCounterAccount.transaction.bookings.filter(
          (booking) => booking.accountId !== "asset-1",
        ),
      },
    });

    expect(getImportDraftStatus(withoutCurrentAccount)).toMatchObject({
      kind: "error",
      message: "Imported transaction must include the current ledger account.",
    });
  });
});
