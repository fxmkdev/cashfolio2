import { createId } from "@paralleldrive/cuid2";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../src/.prisma-client/client";
import {
  AccountType,
  EquityAccountSubtype,
  Unit,
} from "../../src/.prisma-client/enums";
import {
  seedNonZeroConvertibleArchivedAndLiabilityBalancesWithPrisma,
  seedNonZeroConvertibleAssetBalancesWithPrisma,
} from "./valuation-balance-seeds";

const databaseUrl =
  process.env.DATABASE_URL ??
  "postgresql://postgres:postgres@127.0.0.1:5433/postgres?schema=public";

const adapter = new PrismaPg({ connectionString: databaseUrl });
const prisma = new PrismaClient({ adapter });

const DEFAULT_EXTERNAL_ID = process.env.E2E_AUTH_EXTERNAL_ID ?? "e2e-user";

function assertSafeWriteTarget() {
  if (process.env.E2E_TEST_MODE !== "true") {
    throw new Error(
      "Refusing e2e DB writes because E2E_TEST_MODE is not set to true.",
    );
  }

  const parsedUrl = new URL(databaseUrl);
  const allowedHosts = new Set(["127.0.0.1", "localhost", "postgres"]);
  const allowedDatabaseNames = new Set(["postgres", "cashfolio"]);
  const databaseName = parsedUrl.pathname.replace(/^\//, "");
  const isAllowedDatabase =
    allowedDatabaseNames.has(databaseName) ||
    /(?:^|[_-])(test|e2e)(?:$|[_-])/i.test(databaseName);

  if (!allowedHosts.has(parsedUrl.hostname) || !isAllowedDatabase) {
    throw new Error(
      `Refusing e2e DB writes for DATABASE_URL host=${parsedUrl.hostname} db=${databaseName}.`,
    );
  }
}

assertSafeWriteTarget();

export async function resetDatabase(): Promise<void> {
  assertSafeWriteTarget();

  await prisma.$executeRaw`
    TRUNCATE TABLE
      "Booking",
      "Transaction",
      "Account",
      "AccountGroup",
      "UserAccountBookLink",
      "AccountBook",
      "User"
    RESTART IDENTITY CASCADE
  `;
}

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
}): Promise<{ accountBookId: string }> {
  const user = await prisma.user.upsert({
    where: {
      externalId: DEFAULT_EXTERNAL_ID,
    },
    update: {},
    create: {
      id: createId(),
      externalId: DEFAULT_EXTERNAL_ID,
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
    cashAccount: {
      id: cashAccount.id,
      name: cashAccount.name,
    },
    savingsAccount: {
      id: savingsAccount.id,
      name: savingsAccount.name,
    },
    investmentsAccount: {
      id: investmentsAccount.id,
      name: investmentsAccount.name,
    },
    cryptoAccount: {
      id: cryptoAccount.id,
      name: cryptoAccount.name,
    },
    securityAccount: {
      id: securityAccount.id,
      name: securityAccount.name,
    },
    securityCounterAccount: {
      id: securityCounterAccount.id,
      name: securityCounterAccount.name,
    },
    expenseAccount: {
      id: expenseAccount.id,
      name: expenseAccount.name,
    },
    unitlessEquityAccount: {
      id: unitlessEquityAccount.id,
      name: unitlessEquityAccount.name,
    },
  };
}

export async function seedDatabase(args?: {
  accountBookStartDate?: Date;
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

export async function seedExpenseScopeOverflowOptions(args: {
  accountBookId: string;
  currentAccountId: string;
  expenseGroupId: string;
  count?: number;
}) {
  const count = args.count ?? 24;
  if (count < 1) {
    throw new Error("Expected at least one overflow expense account.");
  }

  const accounts = Array.from({ length: count }, (_, index) => {
    const sequence = index + 1;
    const name = `E2E Overflow Expense ${sequence.toString().padStart(2, "0")}`;

    return {
      id: createId(),
      name,
      label: `Equity / E2E Expenses / ${name}`,
    };
  });

  await prisma.account.createMany({
    data: accounts.map((account, index) => ({
      id: account.id,
      accountBookId: args.accountBookId,
      name: account.name,
      type: AccountType.EQUITY,
      equityAccountSubtype: EquityAccountSubtype.EXPENSE,
      groupId: args.expenseGroupId,
      unit: Unit.CURRENCY,
      currency: "CHF",
      sortOrder: index + 10,
    })),
  });

  await prisma.transaction.create({
    data: {
      id: createId(),
      accountBookId: args.accountBookId,
      description: "E2E Timeline Scope Overflow Seed",
      bookings: {
        create: [
          {
            id: createId(),
            accountId: args.currentAccountId,
            date: new Date("2026-01-05T00:00:00.000Z"),
            description: "",
            unit: Unit.CURRENCY,
            currency: "CHF",
            value: -count,
            sortOrder: 0,
          },
          ...accounts.map((account, index) => ({
            id: createId(),
            accountId: account.id,
            date: new Date("2026-01-05T00:00:00.000Z"),
            description: "",
            unit: Unit.CURRENCY,
            currency: "CHF",
            value: 1,
            sortOrder: index + 1,
          })),
        ],
      },
    },
  });

  const targetAccount = accounts[accounts.length - 1];
  if (!targetAccount) {
    throw new Error(
      "Expected overflow expense account seed to create a target.",
    );
  }

  return {
    accounts,
    targetAccount,
  };
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

export async function disconnectDb(): Promise<void> {
  await prisma.$disconnect();
}
