import { createId } from "@paralleldrive/cuid2";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../src/.prisma-client/client";
import {
  AccountType,
  EquityAccountSubtype,
  Unit,
} from "../../src/.prisma-client/enums";

const databaseUrl =
  process.env.DATABASE_URL ??
  "postgresql://postgres:postgres@127.0.0.1:5433/postgres?schema=public";

const adapter = new PrismaPg({ connectionString: databaseUrl });
const prisma = new PrismaClient({ adapter });

const DEFAULT_EXTERNAL_ID = process.env.E2E_AUTH_EXTERNAL_ID ?? "e2e-user";

function assertSafeResetTarget() {
  if (process.env.E2E_TEST_MODE !== "true") {
    throw new Error(
      "Refusing e2e DB reset because E2E_TEST_MODE is not set to true.",
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
      `Refusing e2e DB reset for DATABASE_URL host=${parsedUrl.hostname} db=${databaseName}.`,
    );
  }
}

export type SeededData = {
  accountBookId: string;
  userExternalId: string;
  cashAccount: { id: string; name: string };
  savingsAccount: { id: string; name: string };
  investmentsAccount: { id: string; name: string };
  cryptoAccount: { id: string; name: string };
  securityAccount: { id: string; name: string };
  securityCounterAccount: { id: string; name: string };
  expenseAccount: { id: string; name: string };
};

export async function resetAndSeedDatabase(): Promise<SeededData> {
  assertSafeResetTarget();

  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE
      "Booking",
      "Transaction",
      "Account",
      "AccountGroup",
      "UserAccountBookLink",
      "AccountBook",
      "User"
    RESTART IDENTITY CASCADE
  `);

  const user = await prisma.user.create({
    data: {
      id: createId(),
      externalId: DEFAULT_EXTERNAL_ID,
    },
  });

  const accountBook = await prisma.accountBook.create({
    data: {
      id: createId(),
      name: "E2E Account Book",
      referenceCurrency: "CHF",
    },
  });

  await prisma.userAccountBookLink.create({
    data: {
      userId: user.id,
      accountBookId: accountBook.id,
    },
  });

  const assetRoot = await prisma.accountGroup.create({
    data: {
      id: createId(),
      accountBookId: accountBook.id,
      name: "Assets",
      type: AccountType.ASSET,
      sortOrder: 0,
    },
  });

  await prisma.accountGroup.create({
    data: {
      id: createId(),
      accountBookId: accountBook.id,
      name: "Liabilities",
      type: AccountType.LIABILITY,
      sortOrder: 0,
    },
  });

  const equityRoot = await prisma.accountGroup.create({
    data: {
      id: createId(),
      accountBookId: accountBook.id,
      name: "Equity",
      type: AccountType.EQUITY,
      sortOrder: 0,
    },
  });

  const expenseGroup = await prisma.accountGroup.create({
    data: {
      id: createId(),
      accountBookId: accountBook.id,
      name: "E2E Expenses",
      type: AccountType.EQUITY,
      equityAccountSubtype: EquityAccountSubtype.EXPENSE,
      parentGroupId: equityRoot.id,
      sortOrder: 0,
    },
  });

  const cashAccount = await prisma.account.create({
    data: {
      id: createId(),
      accountBookId: accountBook.id,
      name: "E2E Cash",
      type: AccountType.ASSET,
      groupId: assetRoot.id,
      unit: Unit.CURRENCY,
      currency: "CHF",
      sortOrder: 0,
    },
  });

  const savingsAccount = await prisma.account.create({
    data: {
      id: createId(),
      accountBookId: accountBook.id,
      name: "E2E Savings",
      type: AccountType.ASSET,
      groupId: assetRoot.id,
      unit: Unit.CURRENCY,
      currency: "CHF",
      sortOrder: 1,
    },
  });

  const investmentsAccount = await prisma.account.create({
    data: {
      id: createId(),
      accountBookId: accountBook.id,
      name: "E2E Investments",
      type: AccountType.ASSET,
      groupId: assetRoot.id,
      unit: Unit.CURRENCY,
      currency: "CHF",
      sortOrder: 2,
    },
  });

  const cryptoAccount = await prisma.account.create({
    data: {
      id: createId(),
      accountBookId: accountBook.id,
      name: "E2E Crypto",
      type: AccountType.ASSET,
      groupId: assetRoot.id,
      unit: Unit.CRYPTOCURRENCY,
      cryptocurrency: "BTC",
      sortOrder: 3,
    },
  });

  const securityAccount = await prisma.account.create({
    data: {
      id: createId(),
      accountBookId: accountBook.id,
      name: "E2E Security",
      type: AccountType.ASSET,
      groupId: assetRoot.id,
      unit: Unit.SECURITY,
      symbol: "AAPL",
      tradeCurrency: "USD",
      sortOrder: 4,
    },
  });

  const securityCounterAccount = await prisma.account.create({
    data: {
      id: createId(),
      accountBookId: accountBook.id,
      name: "E2E Security Counter",
      type: AccountType.ASSET,
      groupId: assetRoot.id,
      unit: Unit.SECURITY,
      symbol: "AAPL",
      tradeCurrency: "EUR",
      sortOrder: 5,
    },
  });

  const expenseAccount = await prisma.account.create({
    data: {
      id: createId(),
      accountBookId: accountBook.id,
      name: "E2E Expense",
      type: AccountType.EQUITY,
      equityAccountSubtype: EquityAccountSubtype.EXPENSE,
      groupId: expenseGroup.id,
      unit: Unit.CURRENCY,
      currency: "CHF",
      sortOrder: 0,
    },
  });

  return {
    accountBookId: accountBook.id,
    userExternalId: DEFAULT_EXTERNAL_ID,
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
      name: "E2E Missing FX",
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
      description: "E2E Missing FX Seed",
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
        description: "E2E Missing FX Seed",
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
        description: "E2E Missing FX Seed",
        unit: Unit.CURRENCY,
        currency: "CHF",
        value: -100,
        sortOrder: 1,
      },
    ],
  });

  return account;
}

export async function seedDashboardAssetAllocationBalances(args: {
  accountBookId: string;
  primaryAssetAccountId: string;
  counterAccountId: string;
}) {
  const topLevelGroup = await prisma.accountGroup.create({
    data: {
      id: createId(),
      accountBookId: args.accountBookId,
      name: "E2E Brokerage",
      type: AccountType.ASSET,
      sortOrder: 10,
    },
    select: { id: true, name: true },
  });

  const topLevelGroupAccount = await prisma.account.create({
    data: {
      id: createId(),
      accountBookId: args.accountBookId,
      name: "E2E Brokerage Cash",
      type: AccountType.ASSET,
      groupId: topLevelGroup.id,
      unit: Unit.CURRENCY,
      currency: "CHF",
      sortOrder: 0,
    },
    select: { id: true },
  });

  const transactionId = createId();
  await prisma.transaction.create({
    data: {
      id: transactionId,
      accountBookId: args.accountBookId,
      description: "E2E Dashboard Allocation Seed",
    },
  });

  const date = new Date("2026-01-03T00:00:00.000Z");
  await prisma.booking.createMany({
    data: [
      {
        id: createId(),
        accountBookId: args.accountBookId,
        transactionId,
        accountId: args.primaryAssetAccountId,
        date,
        description: "E2E Dashboard Allocation Seed",
        unit: Unit.CURRENCY,
        currency: "CHF",
        value: 200,
        sortOrder: 0,
      },
      {
        id: createId(),
        accountBookId: args.accountBookId,
        transactionId,
        accountId: topLevelGroupAccount.id,
        date,
        description: "E2E Dashboard Allocation Seed",
        unit: Unit.CURRENCY,
        currency: "CHF",
        value: 100,
        sortOrder: 1,
      },
      {
        id: createId(),
        accountBookId: args.accountBookId,
        transactionId,
        accountId: args.counterAccountId,
        date,
        description: "E2E Dashboard Allocation Seed",
        unit: Unit.CURRENCY,
        currency: "CHF",
        value: -300,
        sortOrder: 2,
      },
    ],
  });

  return {
    topLevelGroupName: topLevelGroup.name,
  };
}

export async function disconnectDb(): Promise<void> {
  await prisma.$disconnect();
}
