type AccountBookGroupReferences = {
  securityHoldingGainLossAccountGroupId: string | null;
  cryptoHoldingGainLossAccountGroupId: string | null;
  fxHoldingGainLossAccountGroupId: string | null;
};

type GroupCountByGroupId = {
  groupId: string | null;
  _count: number;
};

type GroupCountByParentGroupId = {
  parentGroupId: string | null;
  _count: number;
};

export type AccountTreeGroupActionAvailabilitySets = {
  referencedByAccountBook: Set<string>;
  groupsWithChildAccounts: Set<string>;
  groupsWithChildGroups: Set<string>;
  groupsWithActiveChildAccounts: Set<string>;
  groupsWithActiveChildGroups: Set<string>;
};

function getPositiveGroupIdSet(rows: GroupCountByGroupId[]): Set<string> {
  return new Set(
    rows
      .filter((row) => Number(row._count) > 0)
      .map((row) => row.groupId)
      .filter((value): value is string => typeof value === "string"),
  );
}

function getPositiveParentGroupIdSet(
  rows: GroupCountByParentGroupId[],
): Set<string> {
  return new Set(
    rows
      .filter((row) => Number(row._count) > 0)
      .map((row) => row.parentGroupId)
      .filter((value): value is string => typeof value === "string"),
  );
}

export function buildAccountTreeGroupActionAvailabilitySets(args: {
  accountBook: AccountBookGroupReferences;
  allAccountsForGroup: GroupCountByGroupId[];
  allGroupsForParent: GroupCountByParentGroupId[];
  activeAccountsForGroup: GroupCountByGroupId[];
  activeGroupsForParent: GroupCountByParentGroupId[];
}): AccountTreeGroupActionAvailabilitySets {
  const referencedByAccountBook = new Set(
    [
      args.accountBook.securityHoldingGainLossAccountGroupId,
      args.accountBook.cryptoHoldingGainLossAccountGroupId,
      args.accountBook.fxHoldingGainLossAccountGroupId,
    ].filter((id): id is string => id != null),
  );

  return {
    referencedByAccountBook,
    groupsWithChildAccounts: getPositiveGroupIdSet(args.allAccountsForGroup),
    groupsWithChildGroups: getPositiveParentGroupIdSet(args.allGroupsForParent),
    groupsWithActiveChildAccounts: getPositiveGroupIdSet(
      args.activeAccountsForGroup,
    ),
    groupsWithActiveChildGroups: getPositiveParentGroupIdSet(
      args.activeGroupsForParent,
    ),
  };
}
