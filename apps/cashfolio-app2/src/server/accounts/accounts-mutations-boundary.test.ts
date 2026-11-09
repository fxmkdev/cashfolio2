import { beforeEach, describe, expect, it } from "vitest";
import { AccountType } from "../../.prisma-client/enums";
import {
  archiveAccount,
  archiveAccountGroup,
  createAccount,
  createAccountGroup,
  deleteAccount,
  deleteAccountGroup,
  ensureAuthorizedForAccountBookId,
  ensureSameOriginRequestFromServerContext,
  invalidatePeriodBaseDataCacheForAccountBook,
  prisma,
  resetAccountBoundary,
  tx,
  unarchiveAccount,
  unarchiveAccountGroup,
  updateAccount,
  updateAccountGroup,
} from "./accounts-mutations.test-support";

describe("account mutation boundary validation", () => {
  beforeEach(resetAccountBoundary);

  it.each([
    [
      createAccount,
      { accountBookId: "book-1", name: 123, type: AccountType.BALANCE },
    ],
    [
      updateAccount,
      {
        accountBookId: "book-1",
        id: "a-1",
        name: "Name",
        type: AccountType.BALANCE,
        openingBalance: "100",
      },
    ],
    [
      createAccountGroup,
      { accountBookId: "book-1", name: "Name", type: "OTHER" },
    ],
    [
      updateAccountGroup,
      {
        accountBookId: "book-1",
        id: "g-1",
        name: "Name",
        type: AccountType.BALANCE,
        isCashAccount: "true",
      },
    ],
    ...[
      archiveAccount,
      archiveAccountGroup,
      unarchiveAccount,
      unarchiveAccountGroup,
      deleteAccount,
      deleteAccountGroup,
    ].map(
      (mutation) => [mutation, { accountBookId: "book-1", id: null }] as const,
    ),
  ] as const)(
    "rejects malformed data before authorization, operations, or invalidation (%#)",
    async (mutation, data) => {
      await expect(mutation({ data })).rejects.toThrow();
      expect(ensureAuthorizedForAccountBookId).not.toHaveBeenCalled();
      expect(ensureSameOriginRequestFromServerContext).not.toHaveBeenCalled();
      expect(tx.account.findMany).not.toHaveBeenCalled();
      expect(tx.account.findUniqueOrThrow).not.toHaveBeenCalled();
      expect(tx.accountGroup.findMany).not.toHaveBeenCalled();
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(
        invalidatePeriodBaseDataCacheForAccountBook,
      ).not.toHaveBeenCalled();
    },
  );
});
