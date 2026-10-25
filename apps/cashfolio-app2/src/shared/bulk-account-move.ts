import { AccountType, Unit } from "../.prisma-client/enums";
import { validateAccountName } from "./account-validation";

export type MoveAccount = {
  id: string;
  name: string;
  type: AccountType;
  unit: Unit | null;
  groupId: string | null;
  isActive: boolean;
  isCashAccount: boolean;
};

export type MoveAccountGroup = {
  id: string;
  name: string;
  type: AccountType;
  parentGroupId: string | null;
  isActive: boolean;
  isCashAccount: boolean;
};

export type CashFlowChanges = {
  includedAccountIds: string[];
  excludedAccountIds: string[];
};

export type MoveAccountsInput = {
  accountBookId: string;
  accountIds: string[];
  targetGroupId: string | null;
  expectedCashFlowChanges: CashFlowChanges;
};

/** Omitting siblings checks destination compatibility only, for group choices. */
export function getAccountMoveError(
  accounts: MoveAccount[],
  group: MoveAccountGroup | null,
  siblings?: { id: string; name: string }[],
): string | null {
  if (accounts.some((account) => account.type !== AccountType.BALANCE)) {
    return "Only balance accounts can be moved with this action.";
  }
  if (group && group.type !== AccountType.BALANCE) {
    return "The destination must be an account group.";
  }
  if (
    group &&
    !group.isActive &&
    accounts.some((account) => account.isActive)
  ) {
    return "Active accounts cannot be moved to an archived group.";
  }
  if (
    group?.isCashAccount &&
    accounts.some((account) => account.unit !== Unit.CURRENCY)
  ) {
    return "Groups included in cash flow can contain only currency accounts.";
  }
  if (siblings) {
    const selectedIds = new Set(accounts.map((account) => account.id));
    const names = siblings
      .filter((account) => !selectedIds.has(account.id))
      .map((account) => account.name);
    for (const account of accounts) {
      if (validateAccountName(account.name, names)) {
        return `Cannot move “${account.name}”: another account would have the same name in the destination group.`;
      }
      names.push(account.name);
    }
  }
  return null;
}

export function getMovingAccounts(
  accounts: MoveAccount[],
  targetGroupId: string | null,
) {
  return accounts.filter((account) => account.groupId !== targetGroupId);
}

export function getMoveCashFlowChanges(
  accounts: MoveAccount[],
  group: MoveAccountGroup | null,
): CashFlowChanges {
  const moving = getMovingAccounts(accounts, group?.id ?? null);
  return {
    includedAccountIds: group?.isCashAccount
      ? moving
          .filter((account) => !account.isCashAccount)
          .map((account) => account.id)
      : [],
    excludedAccountIds:
      group && !group.isCashAccount
        ? moving
            .filter((account) => account.isCashAccount)
            .map((account) => account.id)
        : [],
  };
}

export function cashFlowChangesMatch(
  actual: CashFlowChanges,
  expected: CashFlowChanges,
) {
  return (["includedAccountIds", "excludedAccountIds"] as const).every(
    (key) => {
      const ids = new Set(expected[key]);
      return (
        actual[key].length === ids.size &&
        actual[key].every((id) => ids.has(id))
      );
    },
  );
}
