import { createId } from "@paralleldrive/cuid2";
import {
  AccountType,
  EquityAccountSubtype,
  Unit,
} from "../../src/.prisma-client/enums";
import { prisma } from "./db-client";
import {
  seedNonZeroConvertibleArchivedAndLiabilityBalancesWithPrisma,
  seedNonZeroConvertibleAssetBalancesWithPrisma,
} from "./valuation-balance-seeds";

export async function getTransactionBookingsByDescription(args: {
  accountBookId: string;
  description: string;
}): Promise<
  Array<{
    accountId: string;
    unit: Unit;
    symbol: string | null;
    tradeCurrency: string | null;
    value: number;
  }>
> {
  const transaction = await prisma.transaction.findFirstOrThrow({
    where: {
      accountBookId: args.accountBookId,
      description: args.description,
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    include: {
      bookings: {
        orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
      },
    },
  });

  return transaction.bookings.map((booking) => ({
    accountId: booking.accountId,
    unit: booking.unit,
    symbol: booking.symbol,
    tradeCurrency: booking.tradeCurrency,
    value: Number(booking.value),
  }));
}

export async function seedThreeBookingSplitTransaction(args: {
  accountBookId: string;
  description: string;
  currentAccountId: string;
  debitAccountIds: [string, string];
  date?: string;
}) {
  const transactionId = createId();
  const bookingDate = new Date(args.date ?? "2026-01-04T00:00:00.000Z");

  await prisma.transaction.create({
    data: {
      id: transactionId,
      accountBookId: args.accountBookId,
      description: args.description,
      bookings: {
        create: [
          {
            id: createId(),
            accountId: args.currentAccountId,
            date: bookingDate,
            description: "",
            unit: Unit.CURRENCY,
            currency: "CHF",
            value: -300,
            sortOrder: 0,
          },
          {
            id: createId(),
            accountId: args.debitAccountIds[0],
            date: bookingDate,
            description: "",
            unit: Unit.CURRENCY,
            currency: "CHF",
            value: 100,
            sortOrder: 1,
          },
          {
            id: createId(),
            accountId: args.debitAccountIds[1],
            date: bookingDate,
            description: "",
            unit: Unit.CURRENCY,
            currency: "CHF",
            value: 200,
            sortOrder: 2,
          },
        ],
      },
    },
  });
}

export async function seedAssetAccountWithMissingReferenceBalance(args: {
  accountBookId: string;
  counterAccountId: string;
}) {
  const assetRootGroup = await prisma.accountGroup.findFirstOrThrow({
    where: {
      accountBookId: args.accountBookId,
      type: AccountType.ASSET,
      parentGroupId: null,
    },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: { id: true },
  });

  const account = await prisma.account.create({
    data: {
      id: createId(),
      accountBookId: args.accountBookId,
      name: "E2E Missing Valuation",
      type: AccountType.ASSET,
      groupId: assetRootGroup.id,
      unit: Unit.CURRENCY,
      currency: "XXX",
      sortOrder: 999,
    },
    select: { id: true, name: true },
  });

  const transactionId = createId();
  await prisma.transaction.create({
    data: {
      id: transactionId,
      accountBookId: args.accountBookId,
      description: "E2E Missing Valuation Seed",
    },
  });

  const date = new Date("2026-01-02T00:00:00.000Z");
  await prisma.booking.createMany({
    data: [
      {
        id: createId(),
        accountBookId: args.accountBookId,
        transactionId,
        accountId: account.id,
        date,
        description: "E2E Missing Valuation Seed",
        unit: Unit.CURRENCY,
        currency: "XXX",
        value: 100,
        sortOrder: 0,
      },
      {
        id: createId(),
        accountBookId: args.accountBookId,
        transactionId,
        accountId: args.counterAccountId,
        date,
        description: "E2E Missing Valuation Seed",
        unit: Unit.CURRENCY,
        currency: "CHF",
        value: -100,
        sortOrder: 1,
      },
    ],
  });

  return account;
}

export async function seedNonZeroConvertibleAssetBalances(args: {
  accountBookId: string;
  counterAccountId: string;
}) {
  return seedNonZeroConvertibleAssetBalancesWithPrisma({
    prisma,
    accountBookId: args.accountBookId,
    counterAccountId: args.counterAccountId,
  });
}

export async function seedNonZeroConvertibleArchivedAndLiabilityBalances(args: {
  accountBookId: string;
  counterAccountId: string;
}) {
  return seedNonZeroConvertibleArchivedAndLiabilityBalancesWithPrisma({
    prisma,
    accountBookId: args.accountBookId,
    counterAccountId: args.counterAccountId,
  });
}

export async function seedSecurityGainLossDrilldownScenario(args: {
  accountBookId: string;
  securityAccountId: string;
  counterAccountId: string;
}) {
  const securityAccount = await prisma.account.findFirstOrThrow({
    where: {
      id: args.securityAccountId,
      accountBookId: args.accountBookId,
      unit: Unit.SECURITY,
    },
    select: {
      symbol: true,
      tradeCurrency: true,
    },
  });
  if (!securityAccount.symbol || !securityAccount.tradeCurrency) {
    throw new Error(
      "Expected security account seed to have symbol and tradeCurrency.",
    );
  }

  const buyTransactionId = createId();
  const sellTransactionId = createId();
  const buyDescription = "E2E Security Gain/Loss Buy";
  const sellDescription = "E2E Security Gain/Loss Sell";

  await prisma.transaction.create({
    data: {
      id: buyTransactionId,
      accountBookId: args.accountBookId,
      description: buyDescription,
      bookings: {
        create: [
          {
            id: createId(),
            accountId: args.securityAccountId,
            date: new Date("2026-02-05T00:00:00.000Z"),
            description: buyDescription,
            unit: Unit.SECURITY,
            symbol: securityAccount.symbol,
            tradeCurrency: securityAccount.tradeCurrency,
            value: 10,
            sortOrder: 0,
          },
          {
            id: createId(),
            accountId: args.counterAccountId,
            date: new Date("2026-02-05T00:00:00.000Z"),
            description: buyDescription,
            unit: Unit.CURRENCY,
            currency: "CHF",
            value: -100,
            sortOrder: 1,
          },
        ],
      },
    },
  });

  await prisma.transaction.create({
    data: {
      id: sellTransactionId,
      accountBookId: args.accountBookId,
      description: sellDescription,
      bookings: {
        create: [
          {
            id: createId(),
            accountId: args.securityAccountId,
            date: new Date("2026-02-12T00:00:00.000Z"),
            description: sellDescription,
            unit: Unit.SECURITY,
            symbol: securityAccount.symbol,
            tradeCurrency: securityAccount.tradeCurrency,
            value: -4,
            sortOrder: 0,
          },
          {
            id: createId(),
            accountId: args.counterAccountId,
            date: new Date("2026-02-12T00:00:00.000Z"),
            description: sellDescription,
            unit: Unit.CURRENCY,
            currency: "CHF",
            value: 48,
            sortOrder: 1,
          },
        ],
      },
    },
  });

  return {
    buyTransactionId,
    sellTransactionId,
    buyDescription,
    sellDescription,
  };
}

export async function seedExplicitGainLossDrilldownScenario(args: {
  accountBookId: string;
  counterAccountId: string;
  amount?: number;
}) {
  const amount = args.amount ?? 25;

  const gainLossAccount =
    (await prisma.account.findFirst({
      where: {
        accountBookId: args.accountBookId,
        type: AccountType.EQUITY,
        equityAccountSubtype: EquityAccountSubtype.GAIN_LOSS,
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: { id: true, name: true },
    })) ??
    (await prisma.account.create({
      data: {
        id: createId(),
        accountBookId: args.accountBookId,
        name: "E2E Gain/Loss Account",
        type: AccountType.EQUITY,
        equityAccountSubtype: EquityAccountSubtype.GAIN_LOSS,
        groupId: null,
        unit: Unit.CURRENCY,
        currency: "CHF",
        sortOrder: 0,
      },
      select: { id: true, name: true },
    }));

  const description = "E2E Explicit Gain/Loss Seed";
  const transactionId = createId();
  await prisma.transaction.create({
    data: {
      id: transactionId,
      accountBookId: args.accountBookId,
      description,
      bookings: {
        create: [
          {
            id: createId(),
            accountId: gainLossAccount.id,
            date: new Date("2026-01-11T00:00:00.000Z"),
            description,
            unit: Unit.CURRENCY,
            currency: "CHF",
            value: amount,
            sortOrder: 0,
          },
          {
            id: createId(),
            accountId: args.counterAccountId,
            date: new Date("2026-01-11T00:00:00.000Z"),
            description,
            unit: Unit.CURRENCY,
            currency: "CHF",
            value: -amount,
            sortOrder: 1,
          },
        ],
      },
    },
  });

  return {
    transactionId,
    gainLossAccountId: gainLossAccount.id,
    gainLossAccountName: gainLossAccount.name,
  };
}

export async function seedActivityPageScenario(args: {
  accountBookId: string;
  cashAccountId: string;
  savingsAccountId: string;
  expenseAccountId: string;
}) {
  const olderTransactionId = createId();
  const newerTransactionId = createId();
  const olderDescription = "E2E Activity Older";
  const newerDescription = "E2E Activity Newer";

  await prisma.transaction.create({
    data: {
      id: olderTransactionId,
      accountBookId: args.accountBookId,
      description: olderDescription,
      bookings: {
        create: [
          {
            id: createId(),
            accountId: args.cashAccountId,
            date: new Date("2026-05-03T00:00:00.000Z"),
            description: `${olderDescription} Cash`,
            unit: Unit.CURRENCY,
            currency: "CHF",
            value: 50,
            sortOrder: 0,
          },
          {
            id: createId(),
            accountId: args.savingsAccountId,
            date: new Date("2026-05-03T00:00:00.000Z"),
            description: `${olderDescription} Savings`,
            unit: Unit.CURRENCY,
            currency: "CHF",
            value: -50,
            sortOrder: 1,
          },
        ],
      },
    },
  });

  await prisma.transaction.create({
    data: {
      id: newerTransactionId,
      accountBookId: args.accountBookId,
      description: newerDescription,
      bookings: {
        create: [
          {
            id: createId(),
            accountId: args.cashAccountId,
            date: new Date("2026-05-12T00:00:00.000Z"),
            description: `${newerDescription} Cash`,
            unit: Unit.CURRENCY,
            currency: "CHF",
            value: 125,
            sortOrder: 0,
          },
          {
            id: createId(),
            accountId: args.expenseAccountId,
            date: new Date("2026-05-12T00:00:00.000Z"),
            description: `${newerDescription} Expense`,
            unit: Unit.CURRENCY,
            currency: "CHF",
            value: -125,
            sortOrder: 1,
          },
        ],
      },
    },
  });

  return {
    olderTransactionId,
    newerTransactionId,
    olderDescription,
    newerDescription,
  };
}
