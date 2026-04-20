import { createId } from "@paralleldrive/cuid2";
import { Decimal } from "@prisma/client-runtime-utils";
import { parseISO } from "date-fns";
import { beforeEach } from "vitest";
import { AccountType, type AccountBook } from "~/.prisma-client/client";
import { Unit } from "~/.prisma-client/enums";
import { prisma } from "~/prisma.server";
import { redis } from "~/redis.server";
import type { UnitInfo } from "~/units/types";

export let testAccountBook: AccountBook = undefined!;

beforeEach(async () => {
  // clean up
  await redis.flushAll();

  await prisma.accountBook.deleteMany({});

  // create basic account book
  testAccountBook = await prisma.accountBook.create({
    data: {
      id: createId(),
      name: "Test Account Book",
      referenceCurrency: "CHF",
      groups: {
        create: [
          { name: "Assets", type: AccountType.ASSET },
          { name: "Liabilities", type: AccountType.LIABILITY },
          { name: "Equity", type: AccountType.EQUITY },
        ],
      },
    },
  });
});

export type AccountConfig = {
  type: AccountType;
  unit?: UnitInfo;
};

export async function createTestAccount(
  { type, unit }: AccountConfig,
  ...transactions: Omit<CreateTestTransactionBookingArg, "accountId">[]
) {
  const rootGroupForType = await prisma.accountGroup.findFirstOrThrow({
    where: { accountBookId: testAccountBook.id, type, parentGroupId: null },
  });

  const account = await prisma.account.create({
    data: {
      name: `Account ${type}`,
      type,
      groupId: rootGroupForType.id,
      accountBookId: testAccountBook.id,
      unit: unit?.unit,
      currency: unit?.unit === Unit.CURRENCY ? unit?.currency : undefined,
      cryptocurrency:
        unit?.unit === Unit.CRYPTOCURRENCY ? unit?.cryptocurrency : undefined,
      symbol: unit?.unit === Unit.SECURITY ? unit?.symbol : undefined,
      tradeCurrency:
        unit?.unit === Unit.SECURITY ? unit?.tradeCurrency : undefined,
    },
  });

  for (const transaction of transactions) {
    await createTestTransaction({ ...transaction, accountId: account.id });
  }

  return account;
}

type CreateTestTransactionBookingArg = {
  date: string;
  accountId: string;
  currency: string;
  value: number;
};

export async function createTestTransaction(
  ...bookings: CreateTestTransactionBookingArg[]
) {
  return await prisma.transaction.create({
    data: {
      accountBookId: testAccountBook.id,
      description: "",
      bookings: {
        create: bookings.map((b) => ({
          date: parseISO(b.date),
          description: "",
          accountId: b.accountId,
          unit: Unit.CURRENCY,
          currency: b.currency,
          value: new Decimal(b.value),
        })),
      },
    },
  });
}

export async function setupTestHoldingGainLossAccountGroups() {
  const equityRootGroup = await prisma.accountGroup.findFirstOrThrow({
    where: {
      accountBookId: testAccountBook.id,
      type: AccountType.EQUITY,
      parentGroupId: null,
    },
  });

  await prisma.accountBook.update({
    where: { id: testAccountBook.id },
    data: {
      fxHoldingGainLossAccountGroup: {
        create: {
          accountBookId: testAccountBook.id,
          name: "FX Holding Gain/Loss",
          type: AccountType.EQUITY,
          parentGroupId: equityRootGroup.id,
        },
      },
      cryptoHoldingGainLossAccountGroup: {
        create: {
          accountBookId: testAccountBook.id,
          name: "Crypto Holding Gain/Loss",
          type: AccountType.EQUITY,
          parentGroupId: equityRootGroup.id,
        },
      },
      securityHoldingGainLossAccountGroup: {
        create: {
          accountBookId: testAccountBook.id,
          name: "Security Holding Gain/Loss",
          type: AccountType.EQUITY,
          parentGroupId: equityRootGroup.id,
        },
      },
    },
  });
}
