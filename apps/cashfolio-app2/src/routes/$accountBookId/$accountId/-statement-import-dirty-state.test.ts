import { describe, expect, test } from "vitest";
import {
  createStatementImportDraft,
  updateStatementImportDraftDescription,
  updateStatementImportDraftCounterAccount,
  updateStatementImportDraftTransaction,
  toStatementImportEditInitialValues,
} from "./-statement-import";
import {
  accountOptions,
  createRow,
  currentAccount,
} from "./-statement-import-test-fixtures";
import { toTransactionSubmitBookings } from "@/components/edit-transaction-modal-values";
import { getStatementImportReviewSnapshot } from "./-statement-import-dirty-state";

function createDraft() {
  return createStatementImportDraft({
    row: createRow(),
    sourceRowNumber: 2,
    currentAccount,
  });
}

describe("statement import dirty snapshot", () => {
  test("ignores draft metadata and computed review fields", () => {
    const draft = createDraft();
    const baseline = getStatementImportReviewSnapshot([draft]);
    const row = {
      ...draft,
      id: "another-id",
      sourceRowNumber: 8,
      date: "display-only",
      description: "display-only",
      counterAccountId: "display-only",
      balance: 100,
    };
    expect(getStatementImportReviewSnapshot([row])).toBe(baseline);
    expect(getStatementImportReviewSnapshot([structuredClone(draft)])).toBe(
      baseline,
    );
  });

  test("detects description, counter-account and inclusion changes and their reversal", () => {
    const draft = createDraft();
    const baseline = getStatementImportReviewSnapshot([draft]);
    const edited = updateStatementImportDraftDescription({
      draft,
      description: "Changed",
    });
    const counterEdited = updateStatementImportDraftCounterAccount({
      draft,
      selectedAccount: accountOptions.find(
        (account) => account.value === "income-1",
      ),
    });
    for (const nextDraft of [
      edited,
      counterEdited,
      { ...draft, ignored: true },
    ]) {
      expect(getStatementImportReviewSnapshot([nextDraft])).not.toBe(baseline);
    }
    const reverted = updateStatementImportDraftDescription({
      draft: edited,
      description: draft.description,
    });
    expect(getStatementImportReviewSnapshot([reverted])).toBe(baseline);
    expect(
      getStatementImportReviewSnapshot([{ ...draft, ignored: false }]),
    ).toBe(baseline);
  });

  test.each([
    ["date", "2026-06-01T00:00:00.000Z"],
    ["accountId", "other-account"],
    ["description", "booking note"],
    ["value", 123],
    ["unit", "SECURITY"],
    ["currency", "USD"],
    ["cryptocurrency", "BTC"],
    ["symbol", "AAPL"],
    ["tradeCurrency", "USD"],
  ])("detects booking %s edits", (field, value) => {
    const draft = createDraft();
    const edited = structuredClone(draft);
    Object.assign(edited.transaction.bookings[0], { [field]: value });
    expect(getStatementImportReviewSnapshot([edited])).not.toBe(
      getStatementImportReviewSnapshot([draft]),
    );
  });

  test("no-op modal save does not change the snapshot", () => {
    const draft = createDraft();
    const initial = toStatementImportEditInitialValues(draft);
    const saved = updateStatementImportDraftTransaction({
      draft,
      transaction: {
        description: initial.description,
        bookings: toTransactionSubmitBookings(
          initial.bookings.map((booking) => ({
            ...booking,
            key: "editor-key",
          })),
        ),
      },
    });
    expect(getStatementImportReviewSnapshot([saved])).toBe(
      getStatementImportReviewSnapshot([draft]),
    );
  });

  test("baseline is immutable and detects booking additions and removals", () => {
    const draft = createDraft();
    const baseline = getStatementImportReviewSnapshot([draft]);
    draft.transaction.bookings.push({ ...draft.transaction.bookings[0]! });
    expect(getStatementImportReviewSnapshot([draft])).not.toBe(baseline);
    draft.transaction.bookings.splice(0, 2);
    expect(getStatementImportReviewSnapshot([draft])).not.toBe(baseline);
    expect(getStatementImportReviewSnapshot([])).not.toBe(baseline);
  });
});
