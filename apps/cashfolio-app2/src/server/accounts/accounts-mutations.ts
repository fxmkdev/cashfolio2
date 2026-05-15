import { createServerFn } from "@tanstack/react-start";
import { prisma } from "../../prisma.server";
import { AccountType, EquityAccountSubtype } from "../../.prisma-client/enums";
import { Prisma } from "../../.prisma-client/client";
import {
  validateAccountInput,
  validateAccountGroupInput,
} from "../../shared/account-validation";
import { getBookingUnitFields } from "../../shared/booking-unit-fields";
import {
  getOpeningBalancesBookingDate,
  getUtcDayRange,
} from "../../shared/date";
import { moneyIsZero } from "../../shared/money";
import { ensureAuthorizedAccountBookMutation } from "../mutation-guard.server";
import {
  assertRecord,
  requireArrayField,
  requireNumberField,
  requireStringField,
} from "../input-validation";
import {
  ensureNoGroupCycle,
  getGroupHierarchy,
  hasInactiveAncestorGroup,
} from "./accounts-helpers";
import {
  assertNoSystemManagedAccountSubtype,
  assertNoSystemManagedGroupSubtype,
} from "./accounts-system-managed-equity-guards";
import type { AccountGroupInput, AccountInput } from "./accounts-types";
import {
  accountTypeRequiresZeroBalanceForArchive,
  getAccountArchiveAvailability,
  getAccountDeleteAvailability,
  getAccountUnarchiveAvailability,
  getGroupArchiveAvailability,
  getGroupDeleteAvailability,
  getGroupUnarchiveAvailability,
} from "./account-tree-rules";
import { invalidatePeriodBaseDataCacheForAccountBook } from "../period/period-base-data-cache";

const OPENING_BALANCES_ACCOUNT_NAME = "Opening Balances";
const OPENING_BALANCE_EPSILON = 0.000001;

function validateAccountMutationInput(data: unknown): AccountInput {
  assertRecord(data);
  requireStringField(data, "accountBookId", "Account book id is required.");
  return data as AccountInput;
}

function validateAccountUpdateInput(data: unknown): AccountInput & {
  id: string;
} {
  assertRecord(data);
  requireStringField(data, "id", "Account id is required.");
  requireStringField(data, "accountBookId", "Account book id is required.");
  return data as AccountInput & { id: string };
}

function validateAccountGroupMutationInput(data: unknown): AccountGroupInput {
  assertRecord(data);
  requireStringField(data, "accountBookId", "Account book id is required.");
  return data as AccountGroupInput;
}

function validateAccountGroupUpdateInput(data: unknown): AccountGroupInput & {
  id: string;
} {
  assertRecord(data);
  requireStringField(data, "id", "Account group id is required.");
  requireStringField(data, "accountBookId", "Account book id is required.");
  return data as AccountGroupInput & { id: string };
}

function validateAccountBookNodeIdInput(data: unknown): {
  id: string;
  accountBookId: string;
} {
  assertRecord(data);
  return {
    id: requireStringField(data, "id", "Node id is required."),
    accountBookId: requireStringField(
      data,
      "accountBookId",
      "Account book id is required.",
    ),
  };
}

function validateReorderAccountTreeItemsInput(data: unknown): {
  accountBookId: string;
  updates: {
    id: string;
    nodeType: "account" | "accountGroup";
    sortOrder: number;
  }[];
} {
  assertRecord(data);
  const accountBookId = requireStringField(
    data,
    "accountBookId",
    "Account book id is required.",
  );
  const updates = requireArrayField(data, "updates", "Updates are required.");

  return {
    accountBookId,
    updates: updates.map((update) => {
      assertRecord(update, "Reorder update must be an object.");
      const nodeType = update.nodeType;
      if (nodeType !== "account" && nodeType !== "accountGroup") {
        throw new Error("Node type is invalid.");
      }

      return {
        id: requireStringField(update, "id", "Node id is required."),
        nodeType,
        sortOrder: requireNumberField(
          update,
          "sortOrder",
          "Sort order is required.",
        ),
      };
    }),
  };
}

function normalizeOpeningBalanceTarget(
  openingBalance: number | null | undefined,
): number | undefined {
  if (openingBalance === undefined) {
    return undefined;
  }
  if (openingBalance === null) {
    return 0;
  }
  const value = Number(openingBalance);
  if (!Number.isFinite(value)) {
    throw new Error("Opening balance is invalid.");
  }
  return value;
}

function isUniqueConstraintError(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return error.code === "P2002";
  }

  if (typeof error !== "object" || error == null) {
    return false;
  }

  const maybeCode = (error as { code?: unknown }).code;
  return maybeCode === "P2002";
}

async function getOrCreateOpeningBalancesAccountId(
  tx: Prisma.TransactionClient,
  accountBookId: string,
): Promise<string> {
  const existing = await tx.account.findFirst({
    where: {
      accountBookId,
      type: AccountType.EQUITY,
      equityAccountSubtype: EquityAccountSubtype.OPENING_BALANCES,
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: { id: true },
  });
  if (existing) {
    return existing.id;
  }

  try {
    const created = await tx.account.create({
      data: {
        name: OPENING_BALANCES_ACCOUNT_NAME,
        type: AccountType.EQUITY,
        equityAccountSubtype: EquityAccountSubtype.OPENING_BALANCES,
        accountBookId,
      },
      select: { id: true },
    });
    return created.id;
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      const concurrentlyCreated = await tx.account.findFirst({
        where: {
          accountBookId,
          type: AccountType.EQUITY,
          equityAccountSubtype: EquityAccountSubtype.OPENING_BALANCES,
        },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        select: { id: true },
      });
      if (concurrentlyCreated) {
        return concurrentlyCreated.id;
      }
    }

    throw error;
  }
}

async function applyOpeningBalanceTarget(args: {
  tx: Prisma.TransactionClient;
  accountBookId: string;
  account: {
    id: string;
    name: string;
    type: AccountType;
    unit: Parameters<typeof getBookingUnitFields>[0]["unit"];
    currency: Parameters<typeof getBookingUnitFields>[0]["currency"];
    cryptocurrency: Parameters<
      typeof getBookingUnitFields
    >[0]["cryptocurrency"];
    symbol: Parameters<typeof getBookingUnitFields>[0]["symbol"];
    tradeCurrency: Parameters<typeof getBookingUnitFields>[0]["tradeCurrency"];
  };
  openingBalance: number | null | undefined;
}) {
  const normalizedOpeningBalance = normalizeOpeningBalanceTarget(
    args.openingBalance,
  );
  if (normalizedOpeningBalance === undefined) {
    return;
  }
  if (
    args.account.type !== AccountType.ASSET &&
    args.account.type !== AccountType.LIABILITY
  ) {
    return;
  }

  const accountBook = await args.tx.accountBook.findUniqueOrThrow({
    where: { id: args.accountBookId },
    select: { startDate: true },
  });
  const openingBalancesBookingDate = getOpeningBalancesBookingDate(
    accountBook.startDate,
  );
  const openingBalanceDateRange = getUtcDayRange(openingBalancesBookingDate);

  const existingOpeningBalanceTransactions = await args.tx.transaction.findMany(
    {
      where: {
        accountBookId: args.accountBookId,
        AND: [
          {
            bookings: {
              some: {
                accountId: args.account.id,
                date: {
                  gte: openingBalanceDateRange.start,
                  lt: openingBalanceDateRange.endExclusive,
                },
              },
            },
          },
          {
            bookings: {
              some: {
                date: {
                  gte: openingBalanceDateRange.start,
                  lt: openingBalanceDateRange.endExclusive,
                },
                account: {
                  type: AccountType.EQUITY,
                  equityAccountSubtype: EquityAccountSubtype.OPENING_BALANCES,
                },
              },
            },
          },
        ],
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: {
        id: true,
        bookings: {
          where: {
            date: {
              gte: openingBalanceDateRange.start,
              lt: openingBalanceDateRange.endExclusive,
            },
          },
          select: {
            id: true,
            accountId: true,
            account: {
              select: {
                id: true,
                type: true,
                equityAccountSubtype: true,
              },
            },
          },
        },
      },
    },
  );
  const targetRawOpeningBalance =
    args.account.type === AccountType.ASSET
      ? normalizedOpeningBalance
      : -normalizedOpeningBalance;
  const hasTargetOpeningBalance =
    Math.abs(targetRawOpeningBalance) > OPENING_BALANCE_EPSILON;

  const bookingUnitFields = getBookingUnitFields(
    args.account,
    "account opening balance",
  );
  const description = `Opening balance adjustment: ${args.account.name}`;

  if (existingOpeningBalanceTransactions.length === 0) {
    if (!hasTargetOpeningBalance) {
      return;
    }

    const openingBalancesAccountId = await getOrCreateOpeningBalancesAccountId(
      args.tx,
      args.accountBookId,
    );
    await args.tx.transaction.create({
      data: {
        description,
        accountBookId: args.accountBookId,
        bookings: {
          create: [
            {
              date: openingBalancesBookingDate,
              description: "",
              account: {
                connect: {
                  id_accountBookId: {
                    id: args.account.id,
                    accountBookId: args.accountBookId,
                  },
                },
              },
              ...bookingUnitFields,
              value: targetRawOpeningBalance,
              sortOrder: 0,
              accountBook: {
                connect: { id: args.accountBookId },
              },
            },
            {
              date: openingBalancesBookingDate,
              description: "",
              account: {
                connect: {
                  id_accountBookId: {
                    id: openingBalancesAccountId,
                    accountBookId: args.accountBookId,
                  },
                },
              },
              ...bookingUnitFields,
              value: -targetRawOpeningBalance,
              sortOrder: 1,
              accountBook: {
                connect: { id: args.accountBookId },
              },
            },
          ],
        },
      },
    });
    return;
  }

  const canonicalTransaction = existingOpeningBalanceTransactions[0]!;
  const accountBooking = canonicalTransaction.bookings.find(
    (booking) => booking.accountId === args.account.id,
  );
  const openingBalancesBooking = canonicalTransaction.bookings.find(
    (booking) =>
      booking.account.type === AccountType.EQUITY &&
      booking.account.equityAccountSubtype ===
        EquityAccountSubtype.OPENING_BALANCES,
  );
  const transactionsToDelete = existingOpeningBalanceTransactions
    .slice(1)
    .map((transaction) => transaction.id);

  if (!accountBooking || !openingBalancesBooking) {
    await args.tx.transaction.deleteMany({
      where: {
        accountBookId: args.accountBookId,
        id: {
          in: existingOpeningBalanceTransactions.map(
            (transaction) => transaction.id,
          ),
        },
      },
    });

    if (!hasTargetOpeningBalance) {
      return;
    }

    const openingBalancesAccountId = await getOrCreateOpeningBalancesAccountId(
      args.tx,
      args.accountBookId,
    );
    await args.tx.transaction.create({
      data: {
        description,
        accountBookId: args.accountBookId,
        bookings: {
          create: [
            {
              date: openingBalancesBookingDate,
              description: "",
              account: {
                connect: {
                  id_accountBookId: {
                    id: args.account.id,
                    accountBookId: args.accountBookId,
                  },
                },
              },
              ...bookingUnitFields,
              value: targetRawOpeningBalance,
              sortOrder: 0,
              accountBook: {
                connect: { id: args.accountBookId },
              },
            },
            {
              date: openingBalancesBookingDate,
              description: "",
              account: {
                connect: {
                  id_accountBookId: {
                    id: openingBalancesAccountId,
                    accountBookId: args.accountBookId,
                  },
                },
              },
              ...bookingUnitFields,
              value: -targetRawOpeningBalance,
              sortOrder: 1,
              accountBook: {
                connect: { id: args.accountBookId },
              },
            },
          ],
        },
      },
    });
    return;
  }

  if (!hasTargetOpeningBalance) {
    await args.tx.transaction.deleteMany({
      where: {
        accountBookId: args.accountBookId,
        id: {
          in: existingOpeningBalanceTransactions.map(
            (transaction) => transaction.id,
          ),
        },
      },
    });
    return;
  }

  const extraBookingIdsOnCanonical = canonicalTransaction.bookings
    .filter(
      (booking) =>
        booking.id !== accountBooking.id &&
        booking.id !== openingBalancesBooking.id,
    )
    .map((booking) => booking.id);

  await args.tx.transaction.update({
    where: {
      id_accountBookId: {
        id: canonicalTransaction.id,
        accountBookId: args.accountBookId,
      },
    },
    data: {
      description,
      bookings: {
        update: [
          {
            where: {
              id_accountBookId: {
                id: accountBooking.id,
                accountBookId: args.accountBookId,
              },
            },
            data: {
              date: openingBalancesBookingDate,
              description: "",
              ...bookingUnitFields,
              value: targetRawOpeningBalance,
              sortOrder: 0,
              account: {
                connect: {
                  id_accountBookId: {
                    id: args.account.id,
                    accountBookId: args.accountBookId,
                  },
                },
              },
            },
          },
          {
            where: {
              id_accountBookId: {
                id: openingBalancesBooking.id,
                accountBookId: args.accountBookId,
              },
            },
            data: {
              date: openingBalancesBookingDate,
              description: "",
              ...bookingUnitFields,
              value: -targetRawOpeningBalance,
              sortOrder: 1,
            },
          },
        ],
      },
    },
  });

  if (extraBookingIdsOnCanonical.length > 0) {
    await args.tx.booking.deleteMany({
      where: {
        accountBookId: args.accountBookId,
        transactionId: canonicalTransaction.id,
        id: { in: extraBookingIdsOnCanonical },
      },
    });
  }

  if (transactionsToDelete.length > 0) {
    await args.tx.transaction.deleteMany({
      where: {
        accountBookId: args.accountBookId,
        id: { in: transactionsToDelete },
      },
    });
  }
}

export const createAccount = createServerFn({ method: "POST" })
  .inputValidator(validateAccountMutationInput)
  .handler(async ({ data }) => {
    await ensureAuthorizedAccountBookMutation(data.accountBookId);
    assertNoSystemManagedAccountSubtype(data);
    const siblingNames = (
      await prisma.account.findMany({
        where: {
          groupId: data.groupId ?? null,
          accountBookId: data.accountBookId,
        },
        select: { name: true },
      })
    ).map((a) => a.name);
    validateAccountInput(data, siblingNames);
    const account = await prisma.$transaction(async (tx) => {
      const createdAccount = await tx.account.create({
        data: {
          name: data.name,
          type: data.type,
          equityAccountSubtype: data.equityAccountSubtype,
          groupId: data.groupId ?? null,
          sortOrder: typeof data.sortOrder === "number" ? data.sortOrder : null,
          unit: data.unit,
          currency: data.currency,
          cryptocurrency: data.cryptocurrency,
          symbol: data.symbol,
          tradeCurrency: data.tradeCurrency,
          accountBookId: data.accountBookId,
        },
      });

      await applyOpeningBalanceTarget({
        tx,
        accountBookId: data.accountBookId,
        account: {
          id: createdAccount.id,
          name: createdAccount.name,
          type: createdAccount.type,
          unit: createdAccount.unit,
          currency: createdAccount.currency,
          cryptocurrency: createdAccount.cryptocurrency,
          symbol: createdAccount.symbol,
          tradeCurrency: createdAccount.tradeCurrency,
        },
        openingBalance: data.openingBalance,
      });

      return createdAccount;
    });
    await invalidatePeriodBaseDataCacheForAccountBook(data.accountBookId);
    return account;
  });

export const updateAccount = createServerFn({ method: "POST" })
  .inputValidator(validateAccountUpdateInput)
  .handler(async ({ data }) => {
    await ensureAuthorizedAccountBookMutation(data.accountBookId);
    const existing = await prisma.account.findUniqueOrThrow({
      where: {
        id_accountBookId: { id: data.id, accountBookId: data.accountBookId },
      },
      select: { type: true, equityAccountSubtype: true },
    });
    assertNoSystemManagedAccountSubtype(existing);
    if (
      data.type !== existing.type ||
      data.equityAccountSubtype !== (existing.equityAccountSubtype ?? undefined)
    ) {
      throw new Error("Account type cannot be changed");
    }

    const siblingNames = (
      await prisma.account.findMany({
        where: {
          groupId: data.groupId ?? null,
          accountBookId: data.accountBookId,
          id: { not: data.id },
        },
        select: { name: true },
      })
    ).map((a) => a.name);
    validateAccountInput(data, siblingNames);
    const account = await prisma.$transaction(async (tx) => {
      const updatedAccount = await tx.account.update({
        where: {
          id_accountBookId: { id: data.id, accountBookId: data.accountBookId },
        },
        data: {
          name: data.name,
          groupId: data.groupId ?? null,
          sortOrder: typeof data.sortOrder === "number" ? data.sortOrder : null,
          unit: data.unit,
          currency: data.currency,
          cryptocurrency: data.cryptocurrency,
          symbol: data.symbol,
          tradeCurrency: data.tradeCurrency,
        },
      });

      await applyOpeningBalanceTarget({
        tx,
        accountBookId: data.accountBookId,
        account: {
          id: updatedAccount.id,
          name: updatedAccount.name,
          type: updatedAccount.type,
          unit: updatedAccount.unit,
          currency: updatedAccount.currency,
          cryptocurrency: updatedAccount.cryptocurrency,
          symbol: updatedAccount.symbol,
          tradeCurrency: updatedAccount.tradeCurrency,
        },
        openingBalance: data.openingBalance,
      });

      return updatedAccount;
    });
    await invalidatePeriodBaseDataCacheForAccountBook(data.accountBookId);
    return account;
  });

export const createAccountGroup = createServerFn({ method: "POST" })
  .inputValidator(validateAccountGroupMutationInput)
  .handler(async ({ data }) => {
    await ensureAuthorizedAccountBookMutation(data.accountBookId);
    assertNoSystemManagedGroupSubtype(data);
    const siblingNames = (
      await prisma.accountGroup.findMany({
        where: {
          parentGroupId: data.parentGroupId ?? null,
          accountBookId: data.accountBookId,
        },
        select: { name: true },
      })
    ).map((g) => g.name);
    validateAccountGroupInput(data, siblingNames);
    const group = await prisma.accountGroup.create({
      data: {
        name: data.name,
        type: data.type,
        equityAccountSubtype: data.equityAccountSubtype,
        isActive: data.isActive ?? true,
        parentGroupId: data.parentGroupId,
        sortOrder: typeof data.sortOrder === "number" ? data.sortOrder : null,
        accountBookId: data.accountBookId,
      },
    });
    await invalidatePeriodBaseDataCacheForAccountBook(data.accountBookId);
    return group;
  });

export const updateAccountGroup = createServerFn({ method: "POST" })
  .inputValidator(validateAccountGroupUpdateInput)
  .handler(async ({ data }) => {
    await ensureAuthorizedAccountBookMutation(data.accountBookId);
    const existing = await prisma.accountGroup.findUniqueOrThrow({
      where: {
        id_accountBookId: { id: data.id, accountBookId: data.accountBookId },
      },
      select: { type: true, equityAccountSubtype: true },
    });
    assertNoSystemManagedGroupSubtype(existing);
    if (
      data.type !== existing.type ||
      data.equityAccountSubtype !== (existing.equityAccountSubtype ?? undefined)
    ) {
      throw new Error("Group type cannot be changed");
    }

    const [siblingGroups, groupById] = await Promise.all([
      prisma.accountGroup.findMany({
        where: {
          parentGroupId: data.parentGroupId ?? null,
          accountBookId: data.accountBookId,
          id: { not: data.id },
        },
        select: { name: true },
      }),
      getGroupHierarchy(data.accountBookId),
    ]);
    const siblingNames = siblingGroups.map((g) => g.name);
    validateAccountGroupInput(data, siblingNames);
    ensureNoGroupCycle({
      groupId: data.id,
      parentGroupId: data.parentGroupId,
      groupById,
    });
    const group = await prisma.accountGroup.update({
      where: {
        id_accountBookId: { id: data.id, accountBookId: data.accountBookId },
      },
      data: {
        name: data.name,
        parentGroupId: data.parentGroupId,
        sortOrder: typeof data.sortOrder === "number" ? data.sortOrder : null,
      },
    });
    await invalidatePeriodBaseDataCacheForAccountBook(data.accountBookId);
    return group;
  });

export const deleteAccount = createServerFn({ method: "POST" })
  .inputValidator(validateAccountBookNodeIdInput)
  .handler(async ({ data }) => {
    await ensureAuthorizedAccountBookMutation(data.accountBookId);
    const [account, bookingCount] = await Promise.all([
      prisma.account.findUniqueOrThrow({
        where: {
          id_accountBookId: { id: data.id, accountBookId: data.accountBookId },
        },
        select: { type: true, equityAccountSubtype: true },
      }),
      prisma.booking.count({
        where: { accountId: data.id, accountBookId: data.accountBookId },
      }),
    ]);
    assertNoSystemManagedAccountSubtype(account);
    const deleteAvailability = getAccountDeleteAvailability(bookingCount > 0);
    if (!deleteAvailability.enabled) {
      throw new Error(deleteAvailability.disabledReason);
    }
    await prisma.account.delete({
      where: {
        id_accountBookId: { id: data.id, accountBookId: data.accountBookId },
      },
    });
    await invalidatePeriodBaseDataCacheForAccountBook(data.accountBookId);
  });

export const deleteAccountGroup = createServerFn({ method: "POST" })
  .inputValidator(validateAccountBookNodeIdInput)
  .handler(async ({ data }) => {
    await ensureAuthorizedAccountBookMutation(data.accountBookId);
    const [group, childAccounts, childGroups] = await Promise.all([
      prisma.accountGroup.findUniqueOrThrow({
        where: {
          id_accountBookId: { id: data.id, accountBookId: data.accountBookId },
        },
        select: {
          type: true,
          equityAccountSubtype: true,
        },
      }),
      prisma.account.count({
        where: { groupId: data.id, accountBookId: data.accountBookId },
      }),
      prisma.accountGroup.count({
        where: { parentGroupId: data.id, accountBookId: data.accountBookId },
      }),
    ]);
    assertNoSystemManagedGroupSubtype(group);
    const deleteAvailability = getGroupDeleteAvailability({
      hasChildAccounts: childAccounts > 0,
      hasChildGroups: childGroups > 0,
    });
    if (!deleteAvailability.enabled) {
      throw new Error(deleteAvailability.disabledReason);
    }
    await prisma.accountGroup.delete({
      where: {
        id_accountBookId: { id: data.id, accountBookId: data.accountBookId },
      },
    });
    await invalidatePeriodBaseDataCacheForAccountBook(data.accountBookId);
  });

export const archiveAccount = createServerFn({ method: "POST" })
  .inputValidator(validateAccountBookNodeIdInput)
  .handler(async ({ data }) => {
    await ensureAuthorizedAccountBookMutation(data.accountBookId);
    const account = await prisma.account.findUniqueOrThrow({
      where: {
        id_accountBookId: { id: data.id, accountBookId: data.accountBookId },
      },
      select: { type: true, equityAccountSubtype: true, isActive: true },
    });
    assertNoSystemManagedAccountSubtype(account);

    if (!account.isActive) return;

    let hasZeroBalance = true;
    if (accountTypeRequiresZeroBalanceForArchive(account.type)) {
      const balance = await prisma.booking.aggregate({
        where: { accountId: data.id, accountBookId: data.accountBookId },
        _sum: { value: true },
      });
      hasZeroBalance = moneyIsZero(balance._sum.value ?? 0);
    }
    const archiveAvailability = getAccountArchiveAvailability({
      isActive: account.isActive,
      hasZeroBalance,
    });
    if (!archiveAvailability.enabled) {
      throw new Error(archiveAvailability.disabledReason);
    }

    await prisma.account.update({
      where: {
        id_accountBookId: { id: data.id, accountBookId: data.accountBookId },
      },
      data: { isActive: false },
    });
    await invalidatePeriodBaseDataCacheForAccountBook(data.accountBookId);
  });

export const archiveAccountGroup = createServerFn({ method: "POST" })
  .inputValidator(validateAccountBookNodeIdInput)
  .handler(async ({ data }) => {
    await ensureAuthorizedAccountBookMutation(data.accountBookId);
    const group = await prisma.accountGroup.findUniqueOrThrow({
      where: {
        id_accountBookId: { id: data.id, accountBookId: data.accountBookId },
      },
      select: { isActive: true, type: true, equityAccountSubtype: true },
    });
    assertNoSystemManagedGroupSubtype(group);

    if (!group.isActive) return;

    const [activeChildAccounts, activeChildGroups] = await Promise.all([
      prisma.account.count({
        where: {
          groupId: data.id,
          accountBookId: data.accountBookId,
          isActive: true,
        },
      }),
      prisma.accountGroup.count({
        where: {
          parentGroupId: data.id,
          accountBookId: data.accountBookId,
          isActive: true,
        },
      }),
    ]);

    const archiveAvailability = getGroupArchiveAvailability({
      isActive: group.isActive,
      hasActiveChildAccounts: activeChildAccounts > 0,
      hasActiveChildGroups: activeChildGroups > 0,
    });
    if (!archiveAvailability.enabled) {
      throw new Error(archiveAvailability.disabledReason);
    }

    await prisma.accountGroup.update({
      where: {
        id_accountBookId: { id: data.id, accountBookId: data.accountBookId },
      },
      data: { isActive: false },
    });
    await invalidatePeriodBaseDataCacheForAccountBook(data.accountBookId);
  });

export const unarchiveAccount = createServerFn({ method: "POST" })
  .inputValidator(validateAccountBookNodeIdInput)
  .handler(async ({ data }) => {
    await ensureAuthorizedAccountBookMutation(data.accountBookId);
    const account = await prisma.account.findUniqueOrThrow({
      where: {
        id_accountBookId: { id: data.id, accountBookId: data.accountBookId },
      },
      select: {
        isActive: true,
        groupId: true,
        type: true,
        equityAccountSubtype: true,
      },
    });
    assertNoSystemManagedAccountSubtype(account);

    if (account.isActive) return;

    const groupById = await getGroupHierarchy(data.accountBookId);
    const unarchiveAvailability = getAccountUnarchiveAvailability({
      isActive: account.isActive,
      hasInactiveAncestor: hasInactiveAncestorGroup(account.groupId, groupById),
    });
    if (!unarchiveAvailability.enabled) {
      throw new Error(unarchiveAvailability.disabledReason);
    }

    await prisma.account.update({
      where: {
        id_accountBookId: { id: data.id, accountBookId: data.accountBookId },
      },
      data: { isActive: true },
    });
    await invalidatePeriodBaseDataCacheForAccountBook(data.accountBookId);
  });

export const unarchiveAccountGroup = createServerFn({ method: "POST" })
  .inputValidator(validateAccountBookNodeIdInput)
  .handler(async ({ data }) => {
    await ensureAuthorizedAccountBookMutation(data.accountBookId);
    const group = await prisma.accountGroup.findUniqueOrThrow({
      where: {
        id_accountBookId: { id: data.id, accountBookId: data.accountBookId },
      },
      select: {
        isActive: true,
        parentGroupId: true,
        type: true,
        equityAccountSubtype: true,
      },
    });
    assertNoSystemManagedGroupSubtype(group);

    if (group.isActive) return;

    const groupById = await getGroupHierarchy(data.accountBookId);
    const unarchiveAvailability = getGroupUnarchiveAvailability({
      isActive: group.isActive,
      hasInactiveAncestor: hasInactiveAncestorGroup(
        group.parentGroupId,
        groupById,
      ),
    });
    if (!unarchiveAvailability.enabled) {
      throw new Error(unarchiveAvailability.disabledReason);
    }

    await prisma.accountGroup.update({
      where: {
        id_accountBookId: { id: data.id, accountBookId: data.accountBookId },
      },
      data: { isActive: true },
    });
    await invalidatePeriodBaseDataCacheForAccountBook(data.accountBookId);
  });

export const reorderAccountTreeItems = createServerFn({ method: "POST" })
  .inputValidator(validateReorderAccountTreeItemsInput)
  .handler(async ({ data }) => {
    await ensureAuthorizedAccountBookMutation(data.accountBookId);
    await prisma.$transaction(
      data.updates.map((u) =>
        u.nodeType === "account"
          ? prisma.account.update({
              where: {
                id_accountBookId: {
                  id: u.id,
                  accountBookId: data.accountBookId,
                },
              },
              data: { sortOrder: u.sortOrder },
            })
          : prisma.accountGroup.update({
              where: {
                id_accountBookId: {
                  id: u.id,
                  accountBookId: data.accountBookId,
                },
              },
              data: { sortOrder: u.sortOrder },
            }),
      ),
    );
    await invalidatePeriodBaseDataCacheForAccountBook(data.accountBookId);
  });
