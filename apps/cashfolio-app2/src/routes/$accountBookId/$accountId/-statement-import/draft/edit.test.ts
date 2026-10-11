import { describe, expect, test } from "vitest";
import { Unit } from "@/.prisma-client/enums";
import {
  createStatementImportDraft,
  hasStatementImportSingleCounterBooking,
  updateStatementImportDraftCounterAccount,
  updateStatementImportDraftDescription,
  updateStatementImportDraftTransaction,
} from "../index";
import {
  accountOptions,
  createRow,
  currentAccount,
  getImportDraftStatus,
} from "../test-fixtures";

describe("statement import draft edits", () => {
  test("direct counter-account edits mark a draft ready", () => {
    const draft = createStatementImportDraft({
      row: createRow(),
      sourceRowNumber: 2,
      currentAccount,
    });

    const updated = updateStatementImportDraftCounterAccount({
      draft,
      selectedAccount: accountOptions.find(
        (account) => account.value === "income-1",
      ),
    });

    expect(updated.transaction.bookings[1]).toMatchObject({
      accountId: "income-1",
      unit: Unit.CURRENCY,
      currency: "EUR",
      value: -92.5,
    });
    expect(updated.counterAccountId).toBe("income-1");
    expect(getImportDraftStatus(updated).kind).toBe("ready");
  });

  test("direct description edits update the draft and transaction description", () => {
    const draft = createStatementImportDraft({
      row: createRow(),
      sourceRowNumber: 2,
      currentAccount,
    });

    const updated = updateStatementImportDraftDescription({
      draft,
      description: "Renamed transfer",
    });

    expect(updated.description).toBe("Renamed transfer");
    expect(updated.transaction.description).toBe("Renamed transfer");
  });

  test("direct description edits do not alter booking descriptions", () => {
    const draft = createStatementImportDraft({
      row: createRow(),
      sourceRowNumber: 2,
      currentAccount,
    });
    const withBookingDescriptions = updateStatementImportDraftTransaction({
      draft,
      transaction: {
        ...draft.transaction,
        bookings: draft.transaction.bookings.map((booking, index) => ({
          ...booking,
          description: index === 0 ? "Bank leg" : "Counter leg",
        })),
      },
    });

    const updated = updateStatementImportDraftDescription({
      draft: withBookingDescriptions,
      description: "",
    });

    expect(updated.description).toBe("");
    expect(updated.transaction.description).toBe("");
    expect(
      updated.transaction.bookings.map((booking) => booking.description),
    ).toEqual(["Bank leg", "Counter leg"]);
  });

  test("direct counter-account edits apply concrete account unit fields", () => {
    const draft = createStatementImportDraft({
      row: createRow(),
      sourceRowNumber: 2,
      currentAccount,
    });

    const updated = updateStatementImportDraftCounterAccount({
      draft,
      selectedAccount: accountOptions.find(
        (account) => account.value === "asset-usd",
      ),
    });

    expect(updated.transaction.bookings[1]).toMatchObject({
      accountId: "asset-usd",
      unit: Unit.CURRENCY,
      currency: "USD",
      value: -92.5,
    });
    expect(updated.counterAccountId).toBe("asset-usd");
  });

  test("direct counter-account edits preserve imported units for unitless equity accounts", () => {
    const draft = createStatementImportDraft({
      row: createRow({
        amount: "-45.10",
        "original amount": "42.00",
        "original currency": "EUR",
      }),
      sourceRowNumber: 2,
      currentAccount,
    });

    const updated = updateStatementImportDraftCounterAccount({
      draft,
      selectedAccount: accountOptions.find(
        (account) => account.value === "expense-1",
      ),
    });

    expect(updated.transaction.bookings[1]).toMatchObject({
      accountId: "expense-1",
      unit: Unit.CURRENCY,
      currency: "EUR",
      value: 42,
    });
    expect(updated.counterAccountId).toBe("expense-1");
  });

  test("direct counter-account edits keep targeting the counter booking after row reorder", () => {
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
    const reordered = updateStatementImportDraftTransaction({
      draft: withCounterAccount,
      transaction: {
        ...withCounterAccount.transaction,
        bookings: [...withCounterAccount.transaction.bookings].reverse(),
      },
    });

    const updated = updateStatementImportDraftCounterAccount({
      draft: reordered,
      selectedAccount: accountOptions.find(
        (account) => account.value === "asset-usd",
      ),
    });

    expect(updated.currentAccountId).toBe("asset-1");
    expect(updated.transaction.bookings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          accountId: "asset-1",
          currency: "CHF",
          value: 100.25,
        }),
        expect.objectContaining({
          accountId: "asset-usd",
          currency: "USD",
          value: -92.5,
        }),
      ]),
    );
  });

  test("single-counter detection allows simple import drafts", () => {
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

    expect(hasStatementImportSingleCounterBooking(draft)).toBe(true);
    expect(hasStatementImportSingleCounterBooking(withCounterAccount)).toBe(
      true,
    );
  });

  test("single-counter detection treats multiple counter bookings as multiple", () => {
    const draft = createStatementImportDraft({
      row: createRow({ "original currency": "CHF" }),
      sourceRowNumber: 2,
      currentAccount,
    });
    const withMultipleCounters = updateStatementImportDraftTransaction({
      draft,
      transaction: {
        ...draft.transaction,
        bookings: [
          {
            ...draft.transaction.bookings[0],
            accountId: "asset-1",
            value: 100.25,
          },
          {
            ...draft.transaction.bookings[1],
            accountId: "income-1",
            value: -60,
          },
          {
            ...draft.transaction.bookings[1],
            accountId: "income-1",
            value: -40.25,
          },
        ],
      },
    });

    expect(hasStatementImportSingleCounterBooking(withMultipleCounters)).toBe(
      false,
    );
  });

  test("single-counter detection treats missing counter bookings as multiple", () => {
    const draft = createStatementImportDraft({
      row: createRow(),
      sourceRowNumber: 2,
      currentAccount,
    });
    const withoutCounter = updateStatementImportDraftTransaction({
      draft,
      transaction: {
        ...draft.transaction,
        bookings: draft.transaction.bookings.filter(
          (booking) => booking.accountId === "asset-1",
        ),
      },
    });

    expect(hasStatementImportSingleCounterBooking(withoutCounter)).toBe(false);
  });

  test("single-counter detection allows multiple current account bookings", () => {
    const draft = createStatementImportDraft({
      row: createRow({ "original currency": "CHF" }),
      sourceRowNumber: 2,
      currentAccount,
    });
    const withMultipleCurrentBookings = updateStatementImportDraftTransaction({
      draft,
      transaction: {
        ...draft.transaction,
        bookings: [
          {
            ...draft.transaction.bookings[0],
            accountId: "asset-1",
            value: 60,
          },
          {
            ...draft.transaction.bookings[0],
            accountId: "asset-1",
            value: 40.25,
          },
          {
            ...draft.transaction.bookings[1],
            accountId: "income-1",
            value: -100.25,
          },
        ],
      },
    });

    expect(
      hasStatementImportSingleCounterBooking(withMultipleCurrentBookings),
    ).toBe(true);
  });

  test("direct counter-account edits ignore multiple counter drafts", () => {
    const draft = createStatementImportDraft({
      row: createRow({ "original currency": "CHF" }),
      sourceRowNumber: 2,
      currentAccount,
    });
    const withMultipleCounters = updateStatementImportDraftTransaction({
      draft,
      transaction: {
        ...draft.transaction,
        bookings: [
          draft.transaction.bookings[0],
          { ...draft.transaction.bookings[1], accountId: "income-1" },
          { ...draft.transaction.bookings[1], accountId: "expense-1" },
        ],
      },
    });

    const updated = updateStatementImportDraftCounterAccount({
      draft: withMultipleCounters,
      selectedAccount: accountOptions.find(
        (account) => account.value === "asset-usd",
      ),
    });

    expect(updated).toBe(withMultipleCounters);
  });
});
