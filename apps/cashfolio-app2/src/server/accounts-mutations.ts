import { createServerFn } from "@tanstack/react-start";
import { prisma } from "../prisma.server";
import { AccountType, EquityAccountSubtype } from "../.prisma-client/enums";
import type { Prisma } from "../.prisma-client/client";
import {
  validateAccountInput,
  validateAccountGroupInput,
} from "../shared/account-validation";
import { getBookingUnitFields } from "../shared/booking-unit-fields";
import { getOpeningBalancesBookingDate, startOfUtcDay } from "../shared/date";
import { ensureAuthorizedForAccountBookId } from "../account-books/functions.server";
import { ensureSameOriginRequestFromServerContext } from "../security/same-origin.server";
import {
  ensureNoGroupCycle,
  getGroupHierarchy,
  hasInactiveAncestorGroup,
} from "./accounts-helpers";
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

const OPENING_BALANCES_ACCOUNT_NAME = "Opening Balances";
const OPENING_BALANCES_DATE_RANGE_MS = 24 * 60 * 60 * 1000;

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
  const openingBalancesBookingDate = startOfUtcDay(
    getOpeningBalancesBookingDate(accountBook.startDate),
  );
  const openingBalancesBookingDateNext = new Date(
    openingBalancesBookingDate.getTime() + OPENING_BALANCES_DATE_RANGE_MS,
  );

  const openingBalanceAggregate = await args.tx.booking.aggregate({
    where: {
      accountBookId: args.accountBookId,
      accountId: args.account.id,
      date: {
        gte: openingBalancesBookingDate,
        lt: openingBalancesBookingDateNext,
      },
    },
    _sum: { value: true },
  });
  const currentRawOpeningBalance = Number(
    openingBalanceAggregate._sum.value ?? 0,
  );
  const targetRawOpeningBalance =
    args.account.type === AccountType.ASSET
      ? normalizedOpeningBalance
      : -normalizedOpeningBalance;
  const openingBalanceDelta =
    targetRawOpeningBalance - currentRawOpeningBalance;
  if (Math.abs(openingBalanceDelta) <= 0.000001) {
    return;
  }

  const openingBalancesAccountId = await getOrCreateOpeningBalancesAccountId(
    args.tx,
    args.accountBookId,
  );
  const bookingUnitFields = getBookingUnitFields(
    args.account,
    "account opening balance",
  );

  await args.tx.transaction.create({
    data: {
      description: `Opening balance adjustment: ${args.account.name}`,
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
            value: openingBalanceDelta,
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
            value: -openingBalanceDelta,
            sortOrder: 1,
            accountBook: {
              connect: { id: args.accountBookId },
            },
          },
        ],
      },
    },
  });
}

export const createAccount = createServerFn({ method: "POST" })
  .inputValidator((data: AccountInput) => data)
  .handler(async ({ data }) => {
    ensureSameOriginRequestFromServerContext();
    await ensureAuthorizedForAccountBookId(data.accountBookId);
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
    return account;
  });

export const updateAccount = createServerFn({ method: "POST" })
  .inputValidator((data: AccountInput & { id: string }) => data)
  .handler(async ({ data }) => {
    ensureSameOriginRequestFromServerContext();
    await ensureAuthorizedForAccountBookId(data.accountBookId);
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
    const existing = await prisma.account.findUniqueOrThrow({
      where: {
        id_accountBookId: { id: data.id, accountBookId: data.accountBookId },
      },
      select: { type: true, equityAccountSubtype: true },
    });
    if (
      data.type !== existing.type ||
      data.equityAccountSubtype !== (existing.equityAccountSubtype ?? undefined)
    ) {
      throw new Error("Account type cannot be changed");
    }
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
    return account;
  });

export const createAccountGroup = createServerFn({ method: "POST" })
  .inputValidator((data: AccountGroupInput) => data)
  .handler(async ({ data }) => {
    ensureSameOriginRequestFromServerContext();
    await ensureAuthorizedForAccountBookId(data.accountBookId);
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
        parentGroupId: data.parentGroupId,
        sortOrder: typeof data.sortOrder === "number" ? data.sortOrder : null,
        accountBookId: data.accountBookId,
      },
    });
    return group;
  });

export const updateAccountGroup = createServerFn({ method: "POST" })
  .inputValidator((data: AccountGroupInput & { id: string }) => data)
  .handler(async ({ data }) => {
    ensureSameOriginRequestFromServerContext();
    await ensureAuthorizedForAccountBookId(data.accountBookId);
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
    const existing = await prisma.accountGroup.findUniqueOrThrow({
      where: {
        id_accountBookId: { id: data.id, accountBookId: data.accountBookId },
      },
      select: { type: true, equityAccountSubtype: true },
    });
    if (
      data.type !== existing.type ||
      data.equityAccountSubtype !== (existing.equityAccountSubtype ?? undefined)
    ) {
      throw new Error("Group type cannot be changed");
    }
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
    return group;
  });

export const deleteAccount = createServerFn({ method: "POST" })
  .inputValidator((data: { id: string; accountBookId: string }) => data)
  .handler(async ({ data }) => {
    ensureSameOriginRequestFromServerContext();
    await ensureAuthorizedForAccountBookId(data.accountBookId);
    const bookingCount = await prisma.booking.count({
      where: { accountId: data.id, accountBookId: data.accountBookId },
    });
    const deleteAvailability = getAccountDeleteAvailability(bookingCount > 0);
    if (!deleteAvailability.enabled) {
      throw new Error(deleteAvailability.disabledReason);
    }
    await prisma.account.delete({
      where: {
        id_accountBookId: { id: data.id, accountBookId: data.accountBookId },
      },
    });
  });

export const deleteAccountGroup = createServerFn({ method: "POST" })
  .inputValidator((data: { id: string; accountBookId: string }) => data)
  .handler(async ({ data }) => {
    ensureSameOriginRequestFromServerContext();
    await ensureAuthorizedForAccountBookId(data.accountBookId);
    const [childAccounts, childGroups, accountBook] = await Promise.all([
      prisma.account.count({
        where: { groupId: data.id, accountBookId: data.accountBookId },
      }),
      prisma.accountGroup.count({
        where: { parentGroupId: data.id, accountBookId: data.accountBookId },
      }),
      prisma.accountBook.findUniqueOrThrow({
        where: { id: data.accountBookId },
        select: {
          securityHoldingGainLossAccountGroupId: true,
          cryptoHoldingGainLossAccountGroupId: true,
          fxHoldingGainLossAccountGroupId: true,
        },
      }),
    ]);
    const isReferencedByAccountBook = [
      accountBook.securityHoldingGainLossAccountGroupId,
      accountBook.cryptoHoldingGainLossAccountGroupId,
      accountBook.fxHoldingGainLossAccountGroupId,
    ].includes(data.id);
    const deleteAvailability = getGroupDeleteAvailability({
      hasChildAccounts: childAccounts > 0,
      hasChildGroups: childGroups > 0,
      isReferencedByAccountBook,
    });
    if (!deleteAvailability.enabled) {
      throw new Error(deleteAvailability.disabledReason);
    }
    await prisma.accountGroup.delete({
      where: {
        id_accountBookId: { id: data.id, accountBookId: data.accountBookId },
      },
    });
  });

export const archiveAccount = createServerFn({ method: "POST" })
  .inputValidator((data: { id: string; accountBookId: string }) => data)
  .handler(async ({ data }) => {
    ensureSameOriginRequestFromServerContext();
    await ensureAuthorizedForAccountBookId(data.accountBookId);
    const account = await prisma.account.findUniqueOrThrow({
      where: {
        id_accountBookId: { id: data.id, accountBookId: data.accountBookId },
      },
      select: { type: true, isActive: true },
    });

    if (!account.isActive) return;

    let hasZeroBalance = true;
    if (accountTypeRequiresZeroBalanceForArchive(account.type)) {
      const balance = await prisma.booking.aggregate({
        where: { accountId: data.id, accountBookId: data.accountBookId },
        _sum: { value: true },
      });
      hasZeroBalance = Number(balance._sum.value ?? 0) === 0;
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
  });

export const archiveAccountGroup = createServerFn({ method: "POST" })
  .inputValidator((data: { id: string; accountBookId: string }) => data)
  .handler(async ({ data }) => {
    ensureSameOriginRequestFromServerContext();
    await ensureAuthorizedForAccountBookId(data.accountBookId);
    const group = await prisma.accountGroup.findUniqueOrThrow({
      where: {
        id_accountBookId: { id: data.id, accountBookId: data.accountBookId },
      },
      select: { isActive: true },
    });

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
  });

export const unarchiveAccount = createServerFn({ method: "POST" })
  .inputValidator((data: { id: string; accountBookId: string }) => data)
  .handler(async ({ data }) => {
    ensureSameOriginRequestFromServerContext();
    await ensureAuthorizedForAccountBookId(data.accountBookId);
    const account = await prisma.account.findUniqueOrThrow({
      where: {
        id_accountBookId: { id: data.id, accountBookId: data.accountBookId },
      },
      select: { isActive: true, groupId: true },
    });

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
  });

export const unarchiveAccountGroup = createServerFn({ method: "POST" })
  .inputValidator((data: { id: string; accountBookId: string }) => data)
  .handler(async ({ data }) => {
    ensureSameOriginRequestFromServerContext();
    await ensureAuthorizedForAccountBookId(data.accountBookId);
    const group = await prisma.accountGroup.findUniqueOrThrow({
      where: {
        id_accountBookId: { id: data.id, accountBookId: data.accountBookId },
      },
      select: { isActive: true, parentGroupId: true },
    });

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
  });

export const reorderAccountTreeItems = createServerFn({ method: "POST" })
  .inputValidator(
    (data: {
      accountBookId: string;
      updates: {
        id: string;
        nodeType: "account" | "accountGroup";
        sortOrder: number;
      }[];
    }) => data,
  )
  .handler(async ({ data }) => {
    ensureSameOriginRequestFromServerContext();
    await ensureAuthorizedForAccountBookId(data.accountBookId);
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
  });
