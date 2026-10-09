import { describe, expect, test } from "vitest";
import { AccountType, Unit } from "@/.prisma-client/enums";
import {
  getStatementImportBalanceCarriedForwardRow,
  getStatementImportGridRows,
  getStatementImportIgnoredCount,
  getStatementImportReadyCount,
  getStatementImportReviewRows,
  getStatementImportSuccessLedgerSearch,
  getStatementImportSummaryText,
  getStatementImportTransactionsToSubmit,
  isStatementImportDisabled,
  setStatementImportDraftSelection,
} from "./-statement-import-page-controller";
import type {
  StatementImportDraft,
  StatementImportDraftStatus,
} from "./-statement-import";

function createDraft(
  overrides: Partial<StatementImportDraft> = {},
): StatementImportDraft {
  const id = overrides.id ?? "draft-1";
  return {
    id,
    sourceRowNumber: 2,
    currentAccountId: "account-1",
    ignored: false,
    date: "2026-02-05T00:00:00.000Z",
    amount: 10,
    originalAmount: undefined,
    originalCurrency: undefined,
    counterAccountId: "counter-1",
    description: id,
    transaction: {
      description: id,
      bookings: [
        {
          date: "2026-02-05T00:00:00.000Z",
          accountId: "account-1",
          description: "",
          unit: Unit.CURRENCY,
          currency: "CHF",
          value: 10,
        },
        {
          date: "2026-02-05T00:00:00.000Z",
          accountId: "counter-1",
          description: "",
          unit: Unit.CURRENCY,
          currency: "CHF",
          value: -10,
        },
      ],
    },
    ...overrides,
  };
}

const readyStatus: StatementImportDraftStatus = {
  kind: "ready",
  label: "Ready",
  color: "green",
  message: null,
};

const errorStatus: StatementImportDraftStatus = {
  kind: "error",
  label: "Error",
  color: "red",
  message: "Counter account is required.",
};

describe("statement import page controller", () => {
  test("moves filtered ledgers to the latest imported booking period", () => {
    const search = getStatementImportSuccessLedgerSearch({
      selectedPeriodValue: "2026-01",
      createdTransactions: [{ id: "tx-import-1" }, { id: "tx-import-2" }],
      transactions: [
        {
          description: "Earlier",
          bookings: [
            {
              date: "2026-02-05T00:00:00.000Z",
              accountId: "account-1",
              description: "",
              unit: Unit.CURRENCY,
              currency: "CHF",
              value: 10,
            },
            {
              date: "2026-02-05T00:00:00.000Z",
              accountId: "counter-1",
              description: "",
              unit: Unit.CURRENCY,
              currency: "CHF",
              value: -10,
            },
          ],
        },
        {
          description: "Later",
          bookings: [
            {
              date: "2026-03-05T00:00:00.000Z",
              accountId: "account-1",
              description: "",
              unit: Unit.CURRENCY,
              currency: "CHF",
              value: -20,
            },
            {
              date: "2026-03-05T00:00:00.000Z",
              accountId: "counter-1",
              description: "",
              unit: Unit.CURRENCY,
              currency: "CHF",
              value: 20,
            },
          ],
        },
      ],
    });

    expect(search).toEqual({
      period: "2026-03",
      transactionId: "tx-import-2",
    });
  });

  test("scrolls to the imported transaction that determined the period", () => {
    const search = getStatementImportSuccessLedgerSearch({
      selectedPeriodValue: "2026-01",
      createdTransactions: [{ id: "tx-import-1" }, { id: "tx-import-2" }],
      transactions: [
        {
          description: "Later imported first",
          bookings: [
            {
              date: "2026-03-05T00:00:00.000Z",
              accountId: "account-1",
              description: "",
              unit: Unit.CURRENCY,
              currency: "CHF",
              value: 10,
            },
            {
              date: "2026-03-05T00:00:00.000Z",
              accountId: "counter-1",
              description: "",
              unit: Unit.CURRENCY,
              currency: "CHF",
              value: -10,
            },
          ],
        },
        {
          description: "Earlier imported last",
          bookings: [
            {
              date: "2026-02-05T00:00:00.000Z",
              accountId: "account-1",
              description: "",
              unit: Unit.CURRENCY,
              currency: "CHF",
              value: -20,
            },
            {
              date: "2026-02-05T00:00:00.000Z",
              accountId: "counter-1",
              description: "",
              unit: Unit.CURRENCY,
              currency: "CHF",
              value: 20,
            },
          ],
        },
      ],
    });

    expect(search).toEqual({
      period: "2026-03",
      transactionId: "tx-import-1",
    });
  });

  test("keeps all-period ledgers unfiltered after import", () => {
    const search = getStatementImportSuccessLedgerSearch({
      selectedPeriodValue: undefined,
      createdTransactions: [{ id: "tx-import-1" }],
      transactions: [
        {
          description: "Imported",
          bookings: [
            {
              date: "2026-03-05T00:00:00.000Z",
              accountId: "account-1",
              description: "",
              unit: Unit.CURRENCY,
              currency: "CHF",
              value: -20,
            },
          ],
        },
      ],
    });

    expect(search).toEqual({
      period: undefined,
      transactionId: "tx-import-1",
    });
  });

  test("excludes ignored drafts from submit payloads and readiness", () => {
    const readyDraft = createDraft({ id: "ready-draft" });
    const ignoredDraft = createDraft({
      id: "ignored-draft",
      ignored: true,
      transaction: {
        description: "Ignored",
        bookings: [],
      },
    });
    const drafts = [readyDraft, ignoredDraft];
    const statuses = new Map<string, StatementImportDraftStatus>([
      [readyDraft.id, readyStatus],
      [ignoredDraft.id, errorStatus],
    ]);

    expect(getStatementImportIgnoredCount(drafts)).toBe(1);
    expect(getStatementImportReadyCount({ drafts, statuses })).toBe(1);
    expect(
      isStatementImportDisabled({
        drafts,
        readyCount: 1,
        isSubmitting: false,
        isEditSubmitting: false,
      }),
    ).toBe(false);
    expect(getStatementImportTransactionsToSubmit(drafts)).toEqual([
      readyDraft.transaction,
    ]);
    expect(
      getStatementImportSummaryText({
        drafts,
        readyCount: 1,
        ignoredCount: 1,
      }),
    ).toBe("1 of 2 ready, 1 ignored");
  });

  test("disables import when every draft is ignored", () => {
    const drafts = [createDraft({ ignored: true })];

    expect(
      isStatementImportDisabled({
        drafts,
        readyCount: 0,
        isSubmitting: false,
        isEditSubmitting: false,
      }),
    ).toBe(true);
    expect(getStatementImportTransactionsToSubmit(drafts)).toEqual([]);
  });

  test("includes checked drafts and ignores unchecked drafts without changing their data", () => {
    const includedDraft = createDraft({ id: "included-draft", ignored: true });
    const ignoredDraft = createDraft({ id: "ignored-draft" });
    const result = setStatementImportDraftSelection({
      drafts: [includedDraft, ignoredDraft],
      selectedDraftIds: [includedDraft.id],
    });

    expect(result).toEqual([
      { ...includedDraft, ignored: false },
      { ...ignoredDraft, ignored: true },
    ]);
    expect(result[0]?.transaction).toBe(includedDraft.transaction);
    expect(result[1]?.transaction).toBe(ignoredDraft.transaction);
  });

  test("includes every draft when all checkboxes are checked", () => {
    const drafts = [
      createDraft({ id: "draft-1", ignored: true }),
      createDraft({ id: "draft-2", ignored: true }),
    ];
    const result = setStatementImportDraftSelection({
      drafts,
      selectedDraftIds: drafts.map((draft) => draft.id),
    });

    expect(result.map((draft) => draft.ignored)).toEqual([false, false]);
  });

  test("ignores every draft when all checkboxes are unchecked", () => {
    const drafts = [
      createDraft({ id: "draft-1" }),
      createDraft({ id: "draft-2" }),
    ];
    const result = setStatementImportDraftSelection({
      drafts,
      selectedDraftIds: [],
    });

    expect(result.map((draft) => draft.ignored)).toEqual([true, true]);
    expect(getStatementImportTransactionsToSubmit(result)).toEqual([]);
  });

  test("keeps matching inclusion state unchanged and disregards unknown row IDs", () => {
    const includedDraft = createDraft({ id: "included-draft" });
    const ignoredDraft = createDraft({ id: "ignored-draft", ignored: true });
    const drafts = [includedDraft, ignoredDraft];
    const result = setStatementImportDraftSelection({
      drafts,
      selectedDraftIds: [includedDraft.id, "unknown-row"],
    });

    expect(result).toBe(drafts);
    expect(result[0]).toBe(includedDraft);
    expect(result[1]).toBe(ignoredDraft);
  });

  test("derives asset account hypothetical balances from bottom to top in CSV order", () => {
    const firstDraft = createDraft({
      id: "draft-1",
      transaction: {
        description: "First",
        bookings: [
          {
            date: "2026-02-05T00:00:00.000Z",
            accountId: "account-1",
            description: "",
            unit: Unit.CURRENCY,
            currency: "CHF",
            value: 10,
          },
        ],
      },
    });
    const secondDraft = createDraft({
      id: "draft-2",
      transaction: {
        description: "Second",
        bookings: [
          {
            date: "2026-02-05T00:00:00.000Z",
            accountId: "account-1",
            description: "",
            unit: Unit.CURRENCY,
            currency: "CHF",
            value: -4,
          },
        ],
      },
    });

    const rows = getStatementImportReviewRows({
      account: { type: AccountType.ASSET },
      persistedBalance: 100,
      drafts: [firstDraft, secondDraft],
    });

    expect(rows.map((row) => row.id)).toEqual(["draft-1", "draft-2"]);
    expect(rows.map((row) => row.balance)).toEqual([106, 96]);
    expect(
      getStatementImportBalanceCarriedForwardRow({
        account: { type: AccountType.ASSET },
        persistedBalance: 100,
      }),
    ).toEqual({
      id: "__statement_import_balance_carried_forward__",
      rowType: "balanceCarriedForward",
      description: "Balance carried forward",
      balance: 100,
    });
    expect(
      getStatementImportGridRows({
        account: { type: AccountType.ASSET },
        persistedBalance: 100,
        drafts: [firstDraft, secondDraft],
      }).map((row) => row.id),
    ).toEqual([
      "draft-1",
      "draft-2",
      "__statement_import_balance_carried_forward__",
    ]);
  });

  test("suppresses the carried-forward row when the starting balance is zero", () => {
    expect(
      getStatementImportBalanceCarriedForwardRow({
        account: { type: AccountType.ASSET },
        persistedBalance: 0,
      }),
    ).toBeUndefined();
  });

  test("keeps ignored drafts from changing hypothetical balances", () => {
    const ignoredDraft = createDraft({
      id: "ignored-draft",
      ignored: true,
      transaction: {
        description: "Ignored",
        bookings: [
          {
            date: "2026-02-05T00:00:00.000Z",
            accountId: "account-1",
            description: "",
            unit: Unit.CURRENCY,
            currency: "CHF",
            value: 10,
          },
        ],
      },
    });
    const includedDraft = createDraft({
      id: "included-draft",
      transaction: {
        description: "Included",
        bookings: [
          {
            date: "2026-02-05T00:00:00.000Z",
            accountId: "account-1",
            description: "",
            unit: Unit.CURRENCY,
            currency: "CHF",
            value: -4,
          },
        ],
      },
    });

    const rows = getStatementImportReviewRows({
      account: { type: AccountType.ASSET },
      persistedBalance: 100,
      drafts: [ignoredDraft, includedDraft],
    });

    expect(rows.map((row) => row.balance)).toEqual([96, 96]);
  });

  test("sums multiple current-account bookings in edited drafts", () => {
    const draft = createDraft({
      transaction: {
        description: "Split current account draft",
        bookings: [
          {
            date: "2026-02-05T00:00:00.000Z",
            accountId: "account-1",
            description: "",
            unit: Unit.CURRENCY,
            currency: "CHF",
            value: 3,
          },
          {
            date: "2026-02-05T00:00:00.000Z",
            accountId: "account-1",
            description: "",
            unit: Unit.CURRENCY,
            currency: "CHF",
            value: 4,
          },
          {
            date: "2026-02-05T00:00:00.000Z",
            accountId: "counter-1",
            description: "",
            unit: Unit.CURRENCY,
            currency: "CHF",
            value: -7,
          },
        ],
      },
    });

    const rows = getStatementImportReviewRows({
      account: { type: AccountType.ASSET },
      persistedBalance: 5,
      drafts: [draft],
    });

    expect(rows[0]?.balance).toBe(12);
  });

  test("sign-adjusts liability balances like ledger display", () => {
    const draft = createDraft({
      amount: -25,
      transaction: {
        description: "Liability increase",
        bookings: [
          {
            date: "2026-02-05T00:00:00.000Z",
            accountId: "account-1",
            description: "",
            unit: Unit.CURRENCY,
            currency: "CHF",
            value: -25,
          },
        ],
      },
    });

    const rows = getStatementImportReviewRows({
      account: { type: AccountType.LIABILITY },
      persistedBalance: -100,
      drafts: [draft],
    });

    expect(rows[0]?.balance).toBe(125);
    expect(
      getStatementImportBalanceCarriedForwardRow({
        account: { type: AccountType.LIABILITY },
        persistedBalance: -100,
      })?.balance,
    ).toBe(100);
  });
});
