import { AccountType, Unit } from "../../.prisma-client/enums";
import type { Prisma } from "../../.prisma-client/client";
import { prisma } from "../../prisma.server";
import type { AccountGroupInput, AccountInput } from "./accounts-types";

export function normalizeMissingCashAccountFlag<T extends AccountInput>(
  data: T,
): T {
  return {
    ...data,
    isCashAccount: data.isCashAccount ?? false,
  };
}

export function normalizeMissingGroupCashAccountFlag<
  T extends AccountGroupInput,
>(data: T): T {
  return {
    ...data,
    isCashAccount: data.isCashAccount ?? false,
  };
}

function canBeCashAccount(account: { type: AccountType; unit?: Unit | null }) {
  return account.type === AccountType.ASSET && account.unit === Unit.CURRENCY;
}

function canBeCashGroup(group: { type: AccountType }) {
  return group.type === AccountType.ASSET;
}

async function getParentGroupCashFlag(
  args: {
    accountBookId: string;
    parentGroupId?: string | null;
  },
  db: Pick<Prisma.TransactionClient, "accountGroup">,
) {
  if (!args.parentGroupId) return undefined;

  const parentGroup = await db.accountGroup.findUniqueOrThrow({
    where: {
      id_accountBookId: {
        id: args.parentGroupId,
        accountBookId: args.accountBookId,
      },
    },
    select: { isCashAccount: true },
  });

  return parentGroup.isCashAccount;
}

export async function resolveAccountCashFlag<T extends AccountInput>(
  data: T,
  db: Pick<Prisma.TransactionClient, "accountGroup"> = prisma,
): Promise<T> {
  const parentCashFlag = await getParentGroupCashFlag(
    {
      accountBookId: data.accountBookId,
      parentGroupId: data.groupId,
    },
    db,
  );
  const isCashAccount = parentCashFlag ?? data.isCashAccount ?? false;

  if (isCashAccount && !canBeCashAccount(data)) {
    throw new Error("Cash accounts must be currency asset accounts");
  }

  return {
    ...data,
    isCashAccount,
  };
}

export async function resolveAccountGroupCashFlag<T extends AccountGroupInput>(
  data: T,
  db: Pick<Prisma.TransactionClient, "accountGroup"> = prisma,
): Promise<T> {
  const parentCashFlag = await getParentGroupCashFlag(
    {
      accountBookId: data.accountBookId,
      parentGroupId: data.parentGroupId,
    },
    db,
  );
  const isCashAccount = parentCashFlag ?? data.isCashAccount ?? false;

  if (isCashAccount && !canBeCashGroup(data)) {
    throw new Error("Cash account groups must be asset groups");
  }

  return {
    ...data,
    isCashAccount,
  };
}

async function getDescendantGroupIds(args: {
  tx: Prisma.TransactionClient;
  accountBookId: string;
  groupId: string;
}) {
  const groups = await args.tx.accountGroup.findMany({
    where: { accountBookId: args.accountBookId },
    select: { id: true, parentGroupId: true },
  });
  const childrenByParentGroupId = new Map<string, string[]>();
  for (const group of groups) {
    if (!group.parentGroupId) continue;
    const children = childrenByParentGroupId.get(group.parentGroupId) ?? [];
    children.push(group.id);
    childrenByParentGroupId.set(group.parentGroupId, children);
  }

  const groupIds = new Set<string>();
  const stack = [args.groupId];
  while (stack.length > 0) {
    const groupId = stack.pop();
    if (!groupId || groupIds.has(groupId)) continue;
    groupIds.add(groupId);
    stack.push(...(childrenByParentGroupId.get(groupId) ?? []));
  }

  return [...groupIds];
}

export async function assertCashableGroupSubtree(args: {
  tx: Prisma.TransactionClient;
  accountBookId: string;
  groupId: string;
}) {
  const groupIds = await getDescendantGroupIds(args);
  const [groups, accounts] = await Promise.all([
    args.tx.accountGroup.findMany({
      where: {
        accountBookId: args.accountBookId,
        id: { in: groupIds },
      },
      select: { type: true },
    }),
    args.tx.account.findMany({
      where: {
        accountBookId: args.accountBookId,
        groupId: { in: groupIds },
      },
      select: { type: true, unit: true },
    }),
  ]);

  if (groups.some((group) => !canBeCashGroup(group))) {
    throw new Error("Cash account groups must contain only asset groups");
  }
  if (accounts.some((account) => !canBeCashAccount(account))) {
    throw new Error(
      "Cash account groups must contain only currency asset accounts",
    );
  }
}

export async function applyGroupCashFlagToSubtree(args: {
  tx: Prisma.TransactionClient;
  accountBookId: string;
  groupId: string;
  isCashAccount: boolean;
}) {
  const groupIds = await getDescendantGroupIds(args);

  await args.tx.accountGroup.updateMany({
    where: {
      accountBookId: args.accountBookId,
      id: { in: groupIds },
    },
    data: { isCashAccount: args.isCashAccount },
  });
  await args.tx.account.updateMany({
    where: {
      accountBookId: args.accountBookId,
      groupId: { in: groupIds },
    },
    data: { isCashAccount: args.isCashAccount },
  });
}
