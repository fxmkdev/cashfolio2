import { createServerFn } from "@tanstack/react-start";
import { prisma } from "../prisma.server";
import type {
  AccountType,
  EquityAccountSubtype,
  Unit,
} from "../.prisma-client/enums";
import { ensureAuthorizedForAccountBookId } from "../account-books/functions.server";
import {
  getCryptocurrencyToCurrencyExchangeRate,
  getCurrencyExchangeRate,
} from "./fx.server";
import { getGroupPath, hasInactiveAncestorGroup } from "./accounts-helpers";

export const getAccounts = createServerFn({ method: "GET" })
  .inputValidator((data: { accountBookId: string }) => data)
  .handler(async ({ data }) => {
    await ensureAuthorizedForAccountBookId(data.accountBookId);
    const [accounts, allGroups] = await Promise.all([
      prisma.account.findMany({
        where: { accountBookId: data.accountBookId },
        include: { group: true },
        orderBy: { name: "asc" },
      }),
      prisma.accountGroup.findMany({
        where: { accountBookId: data.accountBookId },
      }),
    ]);
    return accounts
      .map((a) => ({
        ...a,
        groupPath: a.groupId ? getGroupPath(a.groupId, allGroups) : "",
      }))
      .toSorted((a, b) =>
        `${a.groupPath} / ${a.name}`.localeCompare(
          `${b.groupPath} / ${b.name}`,
        ),
      );
  });

export const getAccountGroups = createServerFn({ method: "GET" })
  .inputValidator((data: { accountBookId: string }) => data)
  .handler(async ({ data }) => {
    await ensureAuthorizedForAccountBookId(data.accountBookId);
    const groups = await prisma.accountGroup.findMany({
      where: { accountBookId: data.accountBookId, isActive: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    });
    return groups
      .map((g) => ({
        value: g.id,
        label: getGroupPath(g.id, groups),
        type: g.type,
        equityAccountSubtype: g.equityAccountSubtype,
      }))
      .toSorted((a, b) => a.label.localeCompare(b.label));
  });

export const getAccountTreeData = createServerFn({ method: "GET" })
  .inputValidator(
    (data: {
      accountBookId: string;
      type?: AccountType;
      equityAccountSubtype?: EquityAccountSubtype;
      accountState?: "active" | "inactive";
    }) => data,
  )
  .handler(async ({ data }) => {
    await ensureAuthorizedForAccountBookId(data.accountBookId);
    const accountState = data.accountState ?? "active";

    const [accounts, accountGroups] = await Promise.all([
      prisma.account.findMany({
        where: {
          accountBookId: data.accountBookId,
          isActive: accountState === "active",
          type: data.type,
          ...(data.equityAccountSubtype
            ? { equityAccountSubtype: data.equityAccountSubtype }
            : undefined),
        },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      }),
      prisma.accountGroup.findMany({
        where: {
          accountBookId: data.accountBookId,
          type: data.type,
          ...(data.equityAccountSubtype
            ? {
                OR: [
                  { equityAccountSubtype: data.equityAccountSubtype },
                  { equityAccountSubtype: null },
                ],
              }
            : undefined),
        },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      }),
    ]);
    const groupById = new Map(accountGroups.map((g) => [g.id, g]));

    const assetAndLiabilityAccountIds = accounts
      .filter((a) => a.type === "ASSET" || a.type === "LIABILITY")
      .map((a) => a.id);

    // Batch-fetch booking counts per account to determine deletability
    const [
      bookingCounts,
      accountBalances,
      accountBook,
      allAccountsForGroup,
      allGroupsForParent,
      activeAccountsForGroup,
      activeGroupsForParent,
    ] = await Promise.all([
      prisma.booking.groupBy({
        by: ["accountId"],
        where: {
          accountBookId: data.accountBookId,
          accountId: { in: accounts.map((a) => a.id) },
        },
        _count: true,
      }),
      assetAndLiabilityAccountIds.length > 0
        ? prisma.booking.groupBy({
            by: ["accountId"],
            where: {
              accountBookId: data.accountBookId,
              accountId: { in: assetAndLiabilityAccountIds },
            },
            _sum: { value: true },
          })
        : Promise.resolve([]),
      prisma.accountBook.findUniqueOrThrow({
        where: { id: data.accountBookId },
        select: {
          referenceCurrency: true,
          securityHoldingGainLossAccountGroupId: true,
          cryptoHoldingGainLossAccountGroupId: true,
          fxHoldingGainLossAccountGroupId: true,
        },
      }),
      prisma.account.groupBy({
        by: ["groupId"],
        where: { accountBookId: data.accountBookId },
        _count: true,
      }),
      prisma.accountGroup.groupBy({
        by: ["parentGroupId"],
        where: {
          accountBookId: data.accountBookId,
          parentGroupId: { not: null },
        },
        _count: true,
      }),
      prisma.account.groupBy({
        by: ["groupId"],
        where: {
          accountBookId: data.accountBookId,
          groupId: { not: null },
          isActive: true,
        },
        _count: true,
      }),
      prisma.accountGroup.groupBy({
        by: ["parentGroupId"],
        where: {
          accountBookId: data.accountBookId,
          parentGroupId: { not: null },
          isActive: true,
        },
        _count: true,
      }),
    ]);

    const bookingCountByAccountId = new Map(
      bookingCounts.map((b) => [b.accountId, b._count]),
    );
    const rawBalanceByAccountId = new Map(
      accountBalances.map((b) => [b.accountId, Number(b._sum.value ?? 0)]),
    );
    const referenceCurrency = accountBook.referenceCurrency.toUpperCase();
    const today = new Date();
    const usdToReferenceRatePromise =
      referenceCurrency === "USD"
        ? Promise.resolve(1)
        : getCurrencyExchangeRate({
            sourceCurrency: "USD",
            targetCurrency: referenceCurrency,
            date: today,
          });
    const exchangeRateBySourceCurrency = new Map<
      string,
      Promise<number | null>
    >();
    const exchangeRateByCryptocurrency = new Map<
      string,
      Promise<number | null>
    >();

    const accountRows = await Promise.all(
      accounts.map(async (a) => {
        const rawBalance = rawBalanceByAccountId.get(a.id) ?? 0;
        let rawBalanceInReferenceCurrency: number | null = null;
        const isAssetOrLiability = a.type === "ASSET" || a.type === "LIABILITY";
        const shouldComputeCurrencyReferenceBalance =
          isAssetOrLiability && a.unit === "CURRENCY" && Boolean(a.currency);
        const shouldComputeCryptocurrencyReferenceBalance =
          isAssetOrLiability &&
          a.unit === "CRYPTOCURRENCY" &&
          Boolean(a.cryptocurrency);

        if (shouldComputeCurrencyReferenceBalance && a.currency) {
          const sourceCurrency = a.currency.toUpperCase();
          if (rawBalance === 0) {
            rawBalanceInReferenceCurrency = 0;
          } else if (sourceCurrency === referenceCurrency) {
            rawBalanceInReferenceCurrency = rawBalance;
          } else {
            const existingPromise =
              exchangeRateBySourceCurrency.get(sourceCurrency);
            const exchangeRatePromise =
              existingPromise ??
              (async () => {
                const [usdToReferenceRate, sourceToUsdRate] = await Promise.all(
                  [
                    usdToReferenceRatePromise,
                    getCurrencyExchangeRate({
                      sourceCurrency,
                      targetCurrency: "USD",
                      date: today,
                    }),
                  ],
                );
                if (usdToReferenceRate == null || sourceToUsdRate == null) {
                  return null;
                }
                return sourceToUsdRate * usdToReferenceRate;
              })();
            if (!existingPromise) {
              exchangeRateBySourceCurrency.set(
                sourceCurrency,
                exchangeRatePromise,
              );
            }

            const exchangeRate = await exchangeRatePromise;
            if (exchangeRate != null) {
              rawBalanceInReferenceCurrency = rawBalance * exchangeRate;
            }
          }
        } else if (
          shouldComputeCryptocurrencyReferenceBalance &&
          a.cryptocurrency
        ) {
          const cryptocurrency = a.cryptocurrency.toUpperCase();
          if (rawBalance === 0) {
            rawBalanceInReferenceCurrency = 0;
          } else {
            const existingPromise =
              exchangeRateByCryptocurrency.get(cryptocurrency);
            const exchangeRatePromise =
              existingPromise ??
              getCryptocurrencyToCurrencyExchangeRate({
                cryptocurrency,
                targetCurrency: referenceCurrency,
                date: today,
              });
            if (!existingPromise) {
              exchangeRateByCryptocurrency.set(
                cryptocurrency,
                exchangeRatePromise,
              );
            }

            const exchangeRate = await exchangeRatePromise;
            if (exchangeRate != null) {
              rawBalanceInReferenceCurrency = rawBalance * exchangeRate;
            }
          }
        }

        const hasBookings = (bookingCountByAccountId.get(a.id) ?? 0) > 0;
        const requiresZeroBalance =
          a.type === "ASSET" || a.type === "LIABILITY";
        const hasZeroBalance = !requiresZeroBalance || rawBalance === 0;
        const hasInactiveAncestor = hasInactiveAncestorGroup(
          a.groupId,
          groupById,
        );
        const archivable = a.isActive && hasZeroBalance;
        const unarchivable = !a.isActive && !hasInactiveAncestor;
        const displayBalance =
          a.type === "ASSET"
            ? rawBalance
            : a.type === "LIABILITY"
              ? -rawBalance
              : null;
        const displayBalanceInReferenceCurrency =
          rawBalanceInReferenceCurrency == null
            ? null
            : a.type === "ASSET"
              ? rawBalanceInReferenceCurrency
              : a.type === "LIABILITY"
                ? -rawBalanceInReferenceCurrency
                : null;

        return {
          id: a.id,
          nodeType: "account" as "account" | "accountGroup",
          name: a.name,
          type: a.type,
          equityAccountSubtype: a.equityAccountSubtype,
          unit: a.unit as Unit | null,
          currency: a.currency as string | null,
          cryptocurrency: a.cryptocurrency as string | null,
          symbol: a.symbol as string | null,
          tradeCurrency: a.tradeCurrency as string | null,
          balance: displayBalance as number | null,
          balanceInReferenceCurrency: displayBalanceInReferenceCurrency,
          parentId: a.groupId ?? undefined,
          isActive: a.isActive,
          groupId: a.groupId ?? undefined,
          sortOrder: a.sortOrder,
          deletable: !hasBookings,
          deleteDisabledReason: hasBookings
            ? "Cannot delete account because it has bookings"
            : undefined,
          archivable,
          archiveDisabledReason: !a.isActive
            ? "Account is already archived"
            : hasZeroBalance
              ? undefined
              : "Cannot archive account because its balance is not 0",
          unarchivable,
          unarchiveDisabledReason: a.isActive
            ? "Account is already active"
            : hasInactiveAncestor
              ? "Cannot unarchive account because its parent group is archived"
              : undefined,
        };
      }),
    );

    let filteredGroups = accountGroups.filter((g) => g.isActive);
    if (accountState === "inactive") {
      const groupsById = new Map(accountGroups.map((g) => [g.id, g]));
      const groupsToInclude = new Set<string>();

      for (const group of accountGroups) {
        if (!group.isActive) {
          let currentGroupId: string | null = group.id;
          while (currentGroupId) {
            groupsToInclude.add(currentGroupId);
            currentGroupId =
              groupsById.get(currentGroupId)?.parentGroupId ?? null;
          }
        }
      }
      for (const account of accounts) {
        let currentGroupId = account.groupId;
        while (currentGroupId) {
          groupsToInclude.add(currentGroupId);
          currentGroupId =
            groupsById.get(currentGroupId)?.parentGroupId ?? null;
        }
      }

      filteredGroups = accountGroups.filter((g) => groupsToInclude.has(g.id));
    }

    const referencedByAccountBook = new Set(
      [
        accountBook.securityHoldingGainLossAccountGroupId,
        accountBook.cryptoHoldingGainLossAccountGroupId,
        accountBook.fxHoldingGainLossAccountGroupId,
      ].filter(Boolean) as string[],
    );

    const accountCountByGroupId = new Set(
      allAccountsForGroup
        .filter((a) => a._count > 0 && a.groupId)
        .map((a) => a.groupId),
    );
    const groupsWithChildren = new Set(
      allGroupsForParent
        .filter((g) => g._count > 0 && g.parentGroupId)
        .map((g) => g.parentGroupId!),
    );
    const groupsWithActiveAccounts = new Set(
      activeAccountsForGroup
        .filter((a) => a._count > 0 && a.groupId)
        .map((a) => a.groupId),
    );
    const groupsWithActiveChildGroups = new Set(
      activeGroupsForParent
        .filter((g) => g._count > 0 && g.parentGroupId)
        .map((g) => g.parentGroupId!),
    );

    const groupRows = filteredGroups.map((ag) => {
      const hasChildAccounts = accountCountByGroupId.has(ag.id);
      const hasChildGroups = groupsWithChildren.has(ag.id);
      const hasActiveChildAccounts = groupsWithActiveAccounts.has(ag.id);
      const hasActiveChildGroups = groupsWithActiveChildGroups.has(ag.id);
      const hasInactiveAncestor = hasInactiveAncestorGroup(
        ag.parentGroupId,
        groupById,
      );
      const isReferencedByAccountBook = referencedByAccountBook.has(ag.id);
      const deletable =
        !hasChildAccounts && !hasChildGroups && !isReferencedByAccountBook;
      const archivable =
        ag.isActive && !hasActiveChildAccounts && !hasActiveChildGroups;
      const unarchivable = !ag.isActive && !hasInactiveAncestor;
      return {
        id: ag.id,
        nodeType: "accountGroup" as "account" | "accountGroup",
        name: ag.name,
        type: ag.type,
        equityAccountSubtype: ag.equityAccountSubtype,
        unit: null as Unit | null,
        currency: null as string | null,
        cryptocurrency: null as string | null,
        symbol: null as string | null,
        tradeCurrency: null as string | null,
        balance: null as number | null,
        balanceInReferenceCurrency: null as number | null,
        parentId: ag.parentGroupId ?? undefined,
        isActive: ag.isActive,
        groupId: ag.id,
        sortOrder: ag.sortOrder,
        deletable,
        deleteDisabledReason: isReferencedByAccountBook
          ? "Cannot delete group because it is used as a holding gain/loss group"
          : hasChildAccounts
            ? "Cannot delete group because it contains accounts"
            : hasChildGroups
              ? "Cannot delete group because it contains sub-groups"
              : undefined,
        archivable,
        archiveDisabledReason: !ag.isActive
          ? "Group is already archived"
          : hasActiveChildAccounts
            ? "Cannot archive group because it contains active accounts"
            : hasActiveChildGroups
              ? "Cannot archive group because it contains active sub-groups"
              : undefined,
        unarchivable,
        unarchiveDisabledReason: ag.isActive
          ? "Group is already active"
          : hasInactiveAncestor
            ? "Cannot unarchive group because its parent group is archived"
            : undefined,
      };
    });

    const allRows = [...accountRows, ...groupRows];
    allRows.sort((a, b) => {
      // Group siblings together (same parentId)
      const parentA = a.parentId ?? "";
      const parentB = b.parentId ?? "";
      if (parentA !== parentB) return parentA.localeCompare(parentB);
      // sortOrder: defined values first, nulls last
      if (a.sortOrder !== b.sortOrder) {
        if (a.sortOrder == null) return 1;
        if (b.sortOrder == null) return -1;
        return a.sortOrder - b.sortOrder;
      }
      return a.name.localeCompare(b.name);
    });
    return {
      referenceCurrency: accountBook.referenceCurrency.toUpperCase(),
      rows: allRows,
    };
  });
