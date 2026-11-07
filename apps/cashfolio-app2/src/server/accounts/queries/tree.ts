import type { Unit } from "../../../.prisma-client/enums";
import type { AccountTreeDataInput } from "./types";
import { fetchAccountTreeQueryData } from "./tree-data";
import { getDisplayBalanceInReferenceCurrencyByAccountId } from "./reference-balance-valuation";
import { buildAccountTreeGroupActionAvailabilitySets } from "../hierarchy/group-action-availability";
import {
  buildAccountRows,
  buildUnifiedAccountTreeRows,
  buildGroupRows,
  filterGroupsForAccountState,
  sortAccountTreeRows,
} from "./tree-rows";

export async function queryAccountTreeData(
  data: AccountTreeDataInput,
  snapshot?: Awaited<ReturnType<typeof fetchAccountTreeQueryData>>,
) {
  const accountState = data.accountState ?? "active";
  const includeReferenceBalances = data.includeReferenceBalances ?? true;
  const includeActionAvailability = data.includeActionAvailability ?? true;

  const {
    accounts,
    accountGroups,
    groupById,
    accountBook,
    rawBalanceByAccountId,
    allScheduledRawBalanceByAccountId,
    openingRawBalanceByAccountId,
    bookingCounts,
    allAccountsForGroup,
    allGroupsForParent,
    activeAccountsForGroup,
    activeGroupsForParent,
  } =
    snapshot ??
    (await fetchAccountTreeQueryData({
      accountBookId: data.accountBookId,
      accountState,
      type: data.type,
      equityAccountSubtype: data.equityAccountSubtype,
      includeActionAvailability,
    }));

  const bookingCountByAccountId = new Map(
    bookingCounts.map((bookingCount) => [
      bookingCount.accountId,
      bookingCount._count,
    ]),
  );
  const referenceCurrency = accountBook.referenceCurrency.toUpperCase();
  const normalizedAccounts = accounts.map((account) => ({
    assetClassId: account.assetClassId,
    trackingMethod: account.trackingMethod,

    id: account.id,
    name: account.name,
    type: account.type,
    equityAccountSubtype: account.equityAccountSubtype,
    unit: account.unit as Unit | null,
    currency: account.currency as string | null,
    cryptocurrency: account.cryptocurrency as string | null,
    symbol: account.symbol as string | null,
    tradeCurrency: account.tradeCurrency as string | null,
    statementImportCsvFormat: account.statementImportCsvFormat,
    isCashAccount: account.isCashAccount,
    groupId: account.groupId,
    isActive: account.isActive,
    sortOrder: account.sortOrder,
  }));
  const displayBalanceInReferenceCurrencyByAccountId =
    await getDisplayBalanceInReferenceCurrencyByAccountId({
      accounts: accounts.map((account) => ({
        id: account.id,
        type: account.type,
        unit: account.unit as Unit | null,
        currency: account.currency as string | null,
        cryptocurrency: account.cryptocurrency as string | null,
        symbol: account.symbol as string | null,
        tradeCurrency: account.tradeCurrency as string | null,
      })),
      rawBalanceByAccountId,
      referenceCurrency,
      includeReferenceBalances,
    });

  const accountRows = buildAccountRows({
    accounts: normalizedAccounts,
    rawBalanceByAccountId,
    allScheduledRawBalanceByAccountId,
    openingRawBalanceByAccountId,
    displayBalanceInReferenceCurrencyByAccountId,
    bookingCountByAccountId,
    groupById,
    includeActionAvailability,
  });
  const filteredGroups = filterGroupsForAccountState({
    accountState,
    accountGroups: accountGroups.map((group) => ({
      id: group.id,
      name: group.name,
      type: group.type,
      equityAccountSubtype: group.equityAccountSubtype,
      isCashAccount: group.isCashAccount,
      parentGroupId: group.parentGroupId,
      isActive: group.isActive,
      sortOrder: group.sortOrder,
    })),
    accounts: normalizedAccounts,
  });

  const groupActionAvailabilitySets =
    buildAccountTreeGroupActionAvailabilitySets({
      allAccountsForGroup,
      allGroupsForParent,
      activeAccountsForGroup,
      activeGroupsForParent,
    });

  const groupRows = buildGroupRows({
    groups: filteredGroups,
    groupById,
    includeActionAvailability,
    groupsWithChildAccounts:
      groupActionAvailabilitySets.groupsWithChildAccounts,
    groupsWithChildGroups: groupActionAvailabilitySets.groupsWithChildGroups,
    groupsWithActiveChildAccounts:
      groupActionAvailabilitySets.groupsWithActiveChildAccounts,
    groupsWithActiveChildGroups:
      groupActionAvailabilitySets.groupsWithActiveChildGroups,
  });

  return {
    referenceCurrency,
    rows:
      accountState === "all"
        ? sortAccountTreeRows(
            buildUnifiedAccountTreeRows([...accountRows, ...groupRows]),
          )
        : sortAccountTreeRows([...accountRows, ...groupRows]),
  };
}
