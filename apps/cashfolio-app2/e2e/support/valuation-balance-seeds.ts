import { createId } from "@paralleldrive/cuid2";
import type { PrismaClient } from "../../src/.prisma-client/client";
import { AccountType, Unit } from "../../src/.prisma-client/enums";

const CONVERTIBLE_BALANCE_SEED_DATE = new Date("2026-01-03T00:00:00.000Z");

async function findTopLevelGroupId(args: {
  prisma: PrismaClient;
  accountBookId: string;
  type: AccountType;
}) {
  const group = await args.prisma.accountGroup.findFirstOrThrow({
    where: {
      accountBookId: args.accountBookId,
      type: args.type,
      parentGroupId: null,
    },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: { id: true },
  });

  return group.id;
}

async function createSeedTransaction(args: {
  prisma: PrismaClient;
  accountBookId: string;
  description: string;
}) {
  const transactionId = createId();
  await args.prisma.transaction.create({
    data: {
      id: transactionId,
      accountBookId: args.accountBookId,
      description: args.description,
    },
  });
  return transactionId;
}

export async function seedNonZeroConvertibleAssetBalancesWithPrisma(args: {
  prisma: PrismaClient;
  accountBookId: string;
  counterAccountId: string;
}) {
  const assetRootGroupId = await findTopLevelGroupId({
    prisma: args.prisma,
    accountBookId: args.accountBookId,
    type: AccountType.ASSET,
  });

  const usdAccount = await args.prisma.account.create({
    data: {
      id: createId(),
      accountBookId: args.accountBookId,
      name: "E2E USD Cash",
      type: AccountType.ASSET,
      groupId: assetRootGroupId,
      unit: Unit.CURRENCY,
      currency: "USD",
      sortOrder: 980,
    },
    select: { id: true, name: true },
  });

  const cryptoAccount = await args.prisma.account.create({
    data: {
      id: createId(),
      accountBookId: args.accountBookId,
      name: "E2E BTC Wallet",
      type: AccountType.ASSET,
      groupId: assetRootGroupId,
      unit: Unit.CRYPTOCURRENCY,
      cryptocurrency: "BTC",
      sortOrder: 981,
    },
    select: { id: true, name: true },
  });

  const securityAccount = await args.prisma.account.create({
    data: {
      id: createId(),
      accountBookId: args.accountBookId,
      name: "E2E AAPL Holdings",
      type: AccountType.ASSET,
      groupId: assetRootGroupId,
      unit: Unit.SECURITY,
      symbol: "AAPL",
      tradeCurrency: "USD",
      sortOrder: 982,
    },
    select: { id: true, name: true },
  });

  const transactionId = await createSeedTransaction({
    prisma: args.prisma,
    accountBookId: args.accountBookId,
    description: "E2E Convertible Asset Balances Seed",
  });

  await args.prisma.booking.createMany({
    data: [
      {
        id: createId(),
        accountBookId: args.accountBookId,
        transactionId,
        accountId: usdAccount.id,
        date: CONVERTIBLE_BALANCE_SEED_DATE,
        description: "E2E Convertible Asset Balances Seed",
        unit: Unit.CURRENCY,
        currency: "USD",
        value: 10,
        sortOrder: 0,
      },
      {
        id: createId(),
        accountBookId: args.accountBookId,
        transactionId,
        accountId: cryptoAccount.id,
        date: CONVERTIBLE_BALANCE_SEED_DATE,
        description: "E2E Convertible Asset Balances Seed",
        unit: Unit.CRYPTOCURRENCY,
        cryptocurrency: "BTC",
        value: 2,
        sortOrder: 1,
      },
      {
        id: createId(),
        accountBookId: args.accountBookId,
        transactionId,
        accountId: securityAccount.id,
        date: CONVERTIBLE_BALANCE_SEED_DATE,
        description: "E2E Convertible Asset Balances Seed",
        unit: Unit.SECURITY,
        symbol: "AAPL",
        tradeCurrency: "USD",
        value: 3,
        sortOrder: 2,
      },
      {
        id: createId(),
        accountBookId: args.accountBookId,
        transactionId,
        accountId: args.counterAccountId,
        date: CONVERTIBLE_BALANCE_SEED_DATE,
        description: "E2E Convertible Asset Balances Seed",
        unit: Unit.CURRENCY,
        currency: "CHF",
        value: -10,
        sortOrder: 3,
      },
      {
        id: createId(),
        accountBookId: args.accountBookId,
        transactionId,
        accountId: args.counterAccountId,
        date: CONVERTIBLE_BALANCE_SEED_DATE,
        description: "E2E Convertible Asset Balances Seed",
        unit: Unit.CURRENCY,
        currency: "CHF",
        value: -2,
        sortOrder: 4,
      },
      {
        id: createId(),
        accountBookId: args.accountBookId,
        transactionId,
        accountId: args.counterAccountId,
        date: CONVERTIBLE_BALANCE_SEED_DATE,
        description: "E2E Convertible Asset Balances Seed",
        unit: Unit.CURRENCY,
        currency: "CHF",
        value: -3,
        sortOrder: 5,
      },
    ],
  });

  return {
    usdAccountName: usdAccount.name,
    cryptoAccountName: cryptoAccount.name,
    securityAccountName: securityAccount.name,
  };
}

export async function seedNonZeroConvertibleArchivedAndLiabilityBalancesWithPrisma(args: {
  prisma: PrismaClient;
  accountBookId: string;
  counterAccountId: string;
}) {
  const [assetRootGroupId, liabilityRootGroupId] = await Promise.all([
    findTopLevelGroupId({
      prisma: args.prisma,
      accountBookId: args.accountBookId,
      type: AccountType.ASSET,
    }),
    findTopLevelGroupId({
      prisma: args.prisma,
      accountBookId: args.accountBookId,
      type: AccountType.LIABILITY,
    }),
  ]);

  const archivedUsdAssetAccount = await args.prisma.account.create({
    data: {
      id: createId(),
      accountBookId: args.accountBookId,
      name: "E2E Archived USD Cash",
      type: AccountType.ASSET,
      groupId: assetRootGroupId,
      unit: Unit.CURRENCY,
      currency: "USD",
      isActive: false,
      sortOrder: 983,
    },
    select: { id: true, name: true },
  });

  const liabilityUsdAccount = await args.prisma.account.create({
    data: {
      id: createId(),
      accountBookId: args.accountBookId,
      name: "E2E Liability USD",
      type: AccountType.LIABILITY,
      groupId: liabilityRootGroupId,
      unit: Unit.CURRENCY,
      currency: "USD",
      sortOrder: 0,
    },
    select: { id: true, name: true },
  });

  const [archivedSeedTransactionId, liabilitySeedTransactionId] =
    await Promise.all([
      createSeedTransaction({
        prisma: args.prisma,
        accountBookId: args.accountBookId,
        description: "E2E Archived Convertible Balance Seed",
      }),
      createSeedTransaction({
        prisma: args.prisma,
        accountBookId: args.accountBookId,
        description: "E2E Liability Convertible Balance Seed",
      }),
    ]);

  await args.prisma.booking.createMany({
    data: [
      {
        id: createId(),
        accountBookId: args.accountBookId,
        transactionId: archivedSeedTransactionId,
        accountId: archivedUsdAssetAccount.id,
        date: CONVERTIBLE_BALANCE_SEED_DATE,
        description: "E2E Archived Convertible Balance Seed",
        unit: Unit.CURRENCY,
        currency: "USD",
        value: 8,
        sortOrder: 0,
      },
      {
        id: createId(),
        accountBookId: args.accountBookId,
        transactionId: archivedSeedTransactionId,
        accountId: args.counterAccountId,
        date: CONVERTIBLE_BALANCE_SEED_DATE,
        description: "E2E Archived Convertible Balance Seed",
        unit: Unit.CURRENCY,
        currency: "CHF",
        value: -8,
        sortOrder: 1,
      },
      {
        id: createId(),
        accountBookId: args.accountBookId,
        transactionId: liabilitySeedTransactionId,
        accountId: liabilityUsdAccount.id,
        date: CONVERTIBLE_BALANCE_SEED_DATE,
        description: "E2E Liability Convertible Balance Seed",
        unit: Unit.CURRENCY,
        currency: "USD",
        value: 6,
        sortOrder: 0,
      },
      {
        id: createId(),
        accountBookId: args.accountBookId,
        transactionId: liabilitySeedTransactionId,
        accountId: args.counterAccountId,
        date: CONVERTIBLE_BALANCE_SEED_DATE,
        description: "E2E Liability Convertible Balance Seed",
        unit: Unit.CURRENCY,
        currency: "CHF",
        value: -6,
        sortOrder: 1,
      },
    ],
  });

  return {
    archivedAssetAccountName: archivedUsdAssetAccount.name,
    liabilityAccountName: liabilityUsdAccount.name,
  };
}
