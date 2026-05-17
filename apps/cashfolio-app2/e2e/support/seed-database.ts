import { createId } from "@paralleldrive/cuid2";
import {
  AccountType,
  EquityAccountSubtype,
  Unit,
  type UserRole,
} from "../../src/.prisma-client/enums";
import {
  assertSafeWriteTarget,
  DEFAULT_EXTERNAL_ID,
  prisma,
} from "./db-client";

export type SeededData = {
  accountBookId: string;
  userExternalId: string;
  equityGroupId: string;
  expenseGroupId: string;
  cashAccount: { id: string; name: string };
  savingsAccount: { id: string; name: string };
  investmentsAccount: { id: string; name: string };
  cryptoAccount: { id: string; name: string };
  securityAccount: { id: string; name: string };
  securityCounterAccount: { id: string; name: string };
  expenseAccount: { id: string; name: string };
  unitlessEquityAccount: { id: string; name: string };
};

type SeededGroups = {
  assetRootId: string;
  equityGroupId: string;
  expenseGroupId: string;
};

type SeededAccounts = {
  cashAccount: { id: string; name: string };
  savingsAccount: { id: string; name: string };
  investmentsAccount: { id: string; name: string };
  cryptoAccount: { id: string; name: string };
  securityAccount: { id: string; name: string };
  securityCounterAccount: { id: string; name: string };
  expenseAccount: { id: string; name: string };
  unitlessEquityAccount: { id: string; name: string };
};

async function createSeedAccountBook(args?: {
  accountBookStartDate?: Date;
  userRoles?: UserRole[];
}): Promise<{ accountBookId: string }> {
  const user = await prisma.user.upsert({
    where: {
      externalId: DEFAULT_EXTERNAL_ID,
    },
    update: args?.userRoles ? { roles: args.userRoles } : {},
    create: {
      id: createId(),
      externalId: DEFAULT_EXTERNAL_ID,
      roles: args?.userRoles,
    },
  });

  const accountBook = await prisma.accountBook.create({
    data: {
      id: createId(),
      name: "E2E Account Book",
      referenceCurrency: "CHF",
      startDate:
        args?.accountBookStartDate ?? new Date("2017-01-08T00:00:00.000Z"),
    },
  });

  await prisma.userAccountBookLink.create({
    data: {
      userId: user.id,
      accountBookId: accountBook.id,
    },
  });

  return { accountBookId: accountBook.id };
}

async function createSeedGroups(accountBookId: string): Promise<SeededGroups> {
  const assetRoot = await prisma.accountGroup.create({
    data: {
      id: createId(),
      accountBookId,
      name: "Assets",
      type: AccountType.ASSET,
      sortOrder: 0,
    },
  });

  await prisma.accountGroup.create({
    data: {
      id: createId(),
      accountBookId,
      name: "Liabilities",
      type: AccountType.LIABILITY,
      sortOrder: 0,
    },
  });

  const equityRoot = await prisma.accountGroup.create({
    data: {
      id: createId(),
      accountBookId,
      name: "Equity",
      type: AccountType.EQUITY,
      sortOrder: 0,
    },
  });

  const expenseGroup = await prisma.accountGroup.create({
    data: {
      id: createId(),
      accountBookId,
      name: "E2E Expenses",
      type: AccountType.EQUITY,
      equityAccountSubtype: EquityAccountSubtype.EXPENSE,
      parentGroupId: equityRoot.id,
      sortOrder: 0,
    },
  });

  return {
    assetRootId: assetRoot.id,
    equityGroupId: equityRoot.id,
    expenseGroupId: expenseGroup.id,
  };
}

async function createSeedAccounts(args: {
  accountBookId: string;
  assetRootId: string;
  expenseGroupId: string;
}): Promise<SeededAccounts> {
  const cashAccount = await prisma.account.create({
    data: {
      id: createId(),
      accountBookId: args.accountBookId,
      name: "E2E Cash",
      type: AccountType.ASSET,
      groupId: args.assetRootId,
      unit: Unit.CURRENCY,
      currency: "CHF",
      sortOrder: 0,
    },
  });

  const savingsAccount = await prisma.account.create({
    data: {
      id: createId(),
      accountBookId: args.accountBookId,
      name: "E2E Savings",
      type: AccountType.ASSET,
      groupId: args.assetRootId,
      unit: Unit.CURRENCY,
      currency: "CHF",
      sortOrder: 1,
    },
  });

  const investmentsAccount = await prisma.account.create({
    data: {
      id: createId(),
      accountBookId: args.accountBookId,
      name: "E2E Investments",
      type: AccountType.ASSET,
      groupId: args.assetRootId,
      unit: Unit.CURRENCY,
      currency: "CHF",
      sortOrder: 2,
    },
  });

  const cryptoAccount = await prisma.account.create({
    data: {
      id: createId(),
      accountBookId: args.accountBookId,
      name: "E2E Crypto",
      type: AccountType.ASSET,
      groupId: args.assetRootId,
      unit: Unit.CRYPTOCURRENCY,
      cryptocurrency: "BTC",
      sortOrder: 3,
    },
  });

  const securityAccount = await prisma.account.create({
    data: {
      id: createId(),
      accountBookId: args.accountBookId,
      name: "E2E Security",
      type: AccountType.ASSET,
      groupId: args.assetRootId,
      unit: Unit.SECURITY,
      symbol: "AAPL",
      tradeCurrency: "USD",
      sortOrder: 4,
    },
  });

  const securityCounterAccount = await prisma.account.create({
    data: {
      id: createId(),
      accountBookId: args.accountBookId,
      name: "E2E Security Counter",
      type: AccountType.ASSET,
      groupId: args.assetRootId,
      unit: Unit.SECURITY,
      symbol: "AAPL",
      tradeCurrency: "EUR",
      sortOrder: 5,
    },
  });

  const expenseAccount = await prisma.account.create({
    data: {
      id: createId(),
      accountBookId: args.accountBookId,
      name: "E2E Expense",
      type: AccountType.EQUITY,
      equityAccountSubtype: EquityAccountSubtype.EXPENSE,
      groupId: args.expenseGroupId,
      unit: Unit.CURRENCY,
      currency: "CHF",
      sortOrder: 0,
    },
  });

  const unitlessEquityAccount = await prisma.account.create({
    data: {
      id: createId(),
      accountBookId: args.accountBookId,
      name: "E2E Unitless Equity",
      type: AccountType.EQUITY,
      groupId: null,
      sortOrder: 1,
    },
  });

  return {
    cashAccount: { id: cashAccount.id, name: cashAccount.name },
    savingsAccount: { id: savingsAccount.id, name: savingsAccount.name },
    investmentsAccount: {
      id: investmentsAccount.id,
      name: investmentsAccount.name,
    },
    cryptoAccount: { id: cryptoAccount.id, name: cryptoAccount.name },
    securityAccount: { id: securityAccount.id, name: securityAccount.name },
    securityCounterAccount: {
      id: securityCounterAccount.id,
      name: securityCounterAccount.name,
    },
    expenseAccount: { id: expenseAccount.id, name: expenseAccount.name },
    unitlessEquityAccount: {
      id: unitlessEquityAccount.id,
      name: unitlessEquityAccount.name,
    },
  };
}

export async function seedDatabase(args?: {
  accountBookStartDate?: Date;
  userRoles?: UserRole[];
}): Promise<SeededData> {
  assertSafeWriteTarget();

  const { accountBookId } = await createSeedAccountBook(args);
  const groups = await createSeedGroups(accountBookId);
  const accounts = await createSeedAccounts({
    accountBookId,
    assetRootId: groups.assetRootId,
    expenseGroupId: groups.expenseGroupId,
  });

  return {
    accountBookId,
    userExternalId: DEFAULT_EXTERNAL_ID,
    equityGroupId: groups.equityGroupId,
    expenseGroupId: groups.expenseGroupId,
    ...accounts,
  };
}
