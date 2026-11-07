import { beforeEach, describe, expect, it, vi } from "vitest";
import { RESOURCE_LIMITS } from "../shared/resource-limits";

const mocks = vi.hoisted(() => ({ authorize: vi.fn(), query: vi.fn() }));
vi.mock("../account-books/functions.server", () => ({
  ensureAuthorizedForAccountBookId: mocks.authorize,
}));
vi.mock("../prisma.server", () => ({
  prisma: {
    account: {
      findMany: mocks.query,
      findUnique: mocks.query,
      findFirst: mocks.query,
    },
    accountGroup: { findMany: mocks.query },
    transaction: { findUniqueOrThrow: mocks.query },
  },
}));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    let validate: (data: unknown) => unknown;
    const chain = {
      validator: (reader: typeof validate) => {
        validate = reader;
        return chain;
      },
      handler:
        (handler: (args: { data: unknown }) => unknown) =>
        ({ data }: { data: unknown }) =>
          Promise.resolve().then(() => handler({ data: validate(data) })),
    };
    return chain;
  },
}));

import {
  getAccounts,
  getAccountGroups,
  getExistingNodes,
  getActiveAccountBookUnitUsage,
  getAccountTreeData,
  getAccountsPageData,
  getAccountReferenceBalances,
  getLedgerAccountActionData,
  getGainLossEquityAccountId,
} from "./accounts/accounts-queries";
import {
  getAccountForLedger,
  getLedgerData,
  getLedgerPeriodBounds,
  getLedgerAccountPersistedBalance,
} from "./ledger";
import { getTransaction } from "./transactions/transactions-queries";
import {
  getAccountGainLoss,
  getAccountGainLossSummaries,
} from "./account-gain-loss";
import {
  readAccountTreeInput,
  readAccountSelectorsInput,
} from "./accounts/accounts-read-input";
import {
  readLedgerInput,
  readLedgerPeriodBoundsInput,
} from "./ledger-input-validation";
import { readTransactionInput } from "./read-input-validation";

describe("read endpoint boundaries", () => {
  beforeEach(() => vi.clearAllMocks());
  const endpoints = {
    getAccounts,
    getAccountGroups,
    getExistingNodes,
    getActiveAccountBookUnitUsage,
    getAccountTreeData,
    getAccountsPageData,
    getAccountReferenceBalances,
    getLedgerAccountActionData,
    getGainLossEquityAccountId,
    getAccountForLedger,
    getLedgerData,
    getLedgerPeriodBounds,
    getLedgerAccountPersistedBalance,
    getTransaction,
    getAccountGainLoss,
    getAccountGainLossSummaries,
  };
  it.each(Object.entries(endpoints))(
    "%s rejects malformed input before authorization or queries",
    async (_name, endpoint) => {
      for (const data of [
        undefined,
        null,
        [],
        1,
        "book",
        {},
        { accountBookId: " " },
        { accountBookId: 12 },
        { accountBookId: "a".repeat(RESOURCE_LIMITS.identifier + 1) },
      ]) {
        await expect(endpoint({ data })).rejects.toThrow();
      }
      expect(mocks.authorize).not.toHaveBeenCalled();
      expect(mocks.query).not.toHaveBeenCalled();
    },
  );

  it.each([
    { type: "ASSET" },
    { accountState: "deleted" },
    { equityAccountSubtype: "OTHER" },
    { includeReferenceBalances: "true" },
    { includeActionAvailability: 1 },
  ])(
    "rejects invalid account scopes %j before authorization",
    async (fields) => {
      await expect(
        getAccountTreeData({ data: { accountBookId: "book", ...fields } }),
      ).rejects.toThrow();
      expect(mocks.authorize).not.toHaveBeenCalled();
      expect(mocks.query).not.toHaveBeenCalled();
    },
  );

  it("preserves omitted options and strips unknown fields", () => {
    expect(
      readAccountTreeInput({ accountBookId: "book", unexpected: true }),
    ).toEqual({
      accountBookId: "book",
      type: undefined,
      equityAccountSubtype: undefined,
      accountState: undefined,
      includeReferenceBalances: undefined,
      includeActionAvailability: undefined,
    });
    expect(() =>
      readAccountSelectorsInput({ accountBookId: "book", accountState: "all" }),
    ).toThrow();
    expect(() =>
      readTransactionInput({ accountBookId: "book", transactionId: " " }),
    ).toThrow();
    expect(() =>
      readLedgerPeriodBoundsInput({ accountBookId: "book", accountId: 1 }),
    ).toThrow();
  });

  it("preserves ledger boolean transport values and optional hint fallback", () => {
    const base = { accountBookId: "book", accountId: "account" };
    for (const value of [true, "true", false, "false", undefined]) {
      expect(
        readLedgerInput({ ...base, includeReferenceValues: value })
          .includeReferenceValues,
      ).toBe(value === true || value === "true");
    }
    expect(
      readLedgerInput({ ...base, accountType: "unknown" }).accountContext,
    ).toBeNull();
    expect(() =>
      readLedgerInput({ ...base, includeFirstBookingDate: 1 }),
    ).toThrow();
  });
});
