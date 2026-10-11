import { type Money, toMoney, moneyAbs } from "../../../shared/money";
import { Prisma } from "../../../.prisma-client/client";
import {
  AccountType,
  EquityAccountSubtype,
} from "../../../.prisma-client/enums";
import { getBookingUnitFields } from "../../../shared/booking-unit-fields";
import {
  getOpeningBalancesBookingDate,
  getUtcDayRange,
} from "../../../shared/date";

const OPENING_BALANCES_ACCOUNT_NAME = "Opening Balances";

const OPENING_BALANCE_EPSILON = 0.000001;

function normalizeOpeningBalanceTarget(
  openingBalance: number | null | undefined,
): Money | undefined {
  if (openingBalance === undefined) {
    return undefined;
  }
  if (openingBalance === null) {
    return toMoney(0);
  }
  const value = Number(openingBalance);
  if (!Number.isFinite(value)) {
    throw new Error("Opening balance is invalid.");
  }
  return toMoney(value);
}

function isUniqueConstraintError(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return error.code === "P2002";
  }

  if (typeof error !== "object" || error == null) {
    return false;
  }

  const maybeCode = (error as { code?: unknown }).code;
  return maybeCode === "P2002";
}

async function getOrCreateOpeningBalancesAccountId(
  tx: Prisma.TransactionClient,
  accountBookId: string,
): Promise<string> {
  const existing = await tx.account.findFirst({
    where: {
      accountBookId,
      type: AccountType.EQUITY,
      equityAccountSubtype: EquityAccountSubtype.OPENING_BALANCES,
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: { id: true },
  });
  if (existing) {
    return existing.id;
  }

  try {
    const created = await tx.account.create({
      data: {
        name: OPENING_BALANCES_ACCOUNT_NAME,
        type: AccountType.EQUITY,
        equityAccountSubtype: EquityAccountSubtype.OPENING_BALANCES,
        accountBookId,
      },
      select: { id: true },
    });
    return created.id;
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      const concurrentlyCreated = await tx.account.findFirst({
        where: {
          accountBookId,
          type: AccountType.EQUITY,
          equityAccountSubtype: EquityAccountSubtype.OPENING_BALANCES,
        },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        select: { id: true },
      });
      if (concurrentlyCreated) {
        return concurrentlyCreated.id;
      }
    }

    throw error;
  }
}

export async function applyOpeningBalanceTarget(args: {
  tx: Prisma.TransactionClient;
  accountBookId: string;
  account: {
    id: string;
    name: string;
    type: AccountType;
    unit: Parameters<typeof getBookingUnitFields>[0]["unit"];
    currency: Parameters<typeof getBookingUnitFields>[0]["currency"];
    cryptocurrency: Parameters<
      typeof getBookingUnitFields
    >[0]["cryptocurrency"];
    symbol: Parameters<typeof getBookingUnitFields>[0]["symbol"];
    tradeCurrency: Parameters<typeof getBookingUnitFields>[0]["tradeCurrency"];
  };
  openingBalance: number | null | undefined;
}) {
  const normalizedOpeningBalance = normalizeOpeningBalanceTarget(
    args.openingBalance,
  );
  if (normalizedOpeningBalance === undefined) {
    return;
  }
  if (
    args.account.type !== AccountType.ASSET &&
    args.account.type !== AccountType.LIABILITY
  ) {
    return;
  }

  const accountBook = await args.tx.accountBook.findUniqueOrThrow({
    where: { id: args.accountBookId },
    select: { startDate: true },
  });
  const openingBalancesBookingDate = getOpeningBalancesBookingDate(
    accountBook.startDate,
  );
  const openingBalanceDateRange = getUtcDayRange(openingBalancesBookingDate);

  const existingOpeningBalanceTransactions = await args.tx.transaction.findMany(
    {
      where: {
        accountBookId: args.accountBookId,
        AND: [
          {
            bookings: {
              some: {
                accountId: args.account.id,
                date: {
                  gte: openingBalanceDateRange.start,
                  lt: openingBalanceDateRange.endExclusive,
                },
              },
            },
          },
          {
            bookings: {
              some: {
                date: {
                  gte: openingBalanceDateRange.start,
                  lt: openingBalanceDateRange.endExclusive,
                },
                account: {
                  type: AccountType.EQUITY,
                  equityAccountSubtype: EquityAccountSubtype.OPENING_BALANCES,
                },
              },
            },
          },
        ],
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: {
        id: true,
        bookings: {
          where: {
            date: {
              gte: openingBalanceDateRange.start,
              lt: openingBalanceDateRange.endExclusive,
            },
          },
          select: {
            id: true,
            accountId: true,
            account: {
              select: {
                id: true,
                type: true,
                equityAccountSubtype: true,
              },
            },
          },
        },
      },
    },
  );
  const targetRawOpeningBalance =
    args.account.type === AccountType.ASSET
      ? normalizedOpeningBalance
      : toMoney(normalizedOpeningBalance).neg();
  const hasTargetOpeningBalance = moneyAbs(targetRawOpeningBalance).greaterThan(
    OPENING_BALANCE_EPSILON,
  );

  const bookingUnitFields = getBookingUnitFields(
    args.account,
    "account opening balance",
  );
  const description = `Opening balance adjustment: ${args.account.name}`;

  if (existingOpeningBalanceTransactions.length === 0) {
    if (!hasTargetOpeningBalance) {
      return;
    }

    const openingBalancesAccountId = await getOrCreateOpeningBalancesAccountId(
      args.tx,
      args.accountBookId,
    );
    await args.tx.transaction.create({
      data: {
        description,
        accountBookId: args.accountBookId,
        bookings: {
          create: [
            {
              date: openingBalancesBookingDate,
              description: "",
              account: {
                connect: {
                  id_accountBookId: {
                    id: args.account.id,
                    accountBookId: args.accountBookId,
                  },
                },
              },
              ...bookingUnitFields,
              value: toMoney(targetRawOpeningBalance).toString(),
              sortOrder: 0,
              accountBook: {
                connect: { id: args.accountBookId },
              },
            },
            {
              date: openingBalancesBookingDate,
              description: "",
              account: {
                connect: {
                  id_accountBookId: {
                    id: openingBalancesAccountId,
                    accountBookId: args.accountBookId,
                  },
                },
              },
              ...bookingUnitFields,
              value: toMoney(targetRawOpeningBalance).neg().toString(),
              sortOrder: 1,
              accountBook: {
                connect: { id: args.accountBookId },
              },
            },
          ],
        },
      },
    });
    return;
  }

  const canonicalTransaction = existingOpeningBalanceTransactions[0]!;
  const accountBooking = canonicalTransaction.bookings.find(
    (booking) => booking.accountId === args.account.id,
  );
  const openingBalancesBooking = canonicalTransaction.bookings.find(
    (booking) =>
      booking.account.type === AccountType.EQUITY &&
      booking.account.equityAccountSubtype ===
        EquityAccountSubtype.OPENING_BALANCES,
  );
  const transactionsToDelete = existingOpeningBalanceTransactions
    .slice(1)
    .map((transaction) => transaction.id);

  if (!accountBooking || !openingBalancesBooking) {
    await args.tx.transaction.deleteMany({
      where: {
        accountBookId: args.accountBookId,
        id: {
          in: existingOpeningBalanceTransactions.map(
            (transaction) => transaction.id,
          ),
        },
      },
    });

    if (!hasTargetOpeningBalance) {
      return;
    }

    const openingBalancesAccountId = await getOrCreateOpeningBalancesAccountId(
      args.tx,
      args.accountBookId,
    );
    await args.tx.transaction.create({
      data: {
        description,
        accountBookId: args.accountBookId,
        bookings: {
          create: [
            {
              date: openingBalancesBookingDate,
              description: "",
              account: {
                connect: {
                  id_accountBookId: {
                    id: args.account.id,
                    accountBookId: args.accountBookId,
                  },
                },
              },
              ...bookingUnitFields,
              value: toMoney(targetRawOpeningBalance).toString(),
              sortOrder: 0,
              accountBook: {
                connect: { id: args.accountBookId },
              },
            },
            {
              date: openingBalancesBookingDate,
              description: "",
              account: {
                connect: {
                  id_accountBookId: {
                    id: openingBalancesAccountId,
                    accountBookId: args.accountBookId,
                  },
                },
              },
              ...bookingUnitFields,
              value: toMoney(targetRawOpeningBalance).neg().toString(),
              sortOrder: 1,
              accountBook: {
                connect: { id: args.accountBookId },
              },
            },
          ],
        },
      },
    });
    return;
  }

  if (!hasTargetOpeningBalance) {
    await args.tx.transaction.deleteMany({
      where: {
        accountBookId: args.accountBookId,
        id: {
          in: existingOpeningBalanceTransactions.map(
            (transaction) => transaction.id,
          ),
        },
      },
    });
    return;
  }

  const extraBookingIdsOnCanonical = canonicalTransaction.bookings
    .filter(
      (booking) =>
        booking.id !== accountBooking.id &&
        booking.id !== openingBalancesBooking.id,
    )
    .map((booking) => booking.id);

  await args.tx.transaction.update({
    where: {
      id_accountBookId: {
        id: canonicalTransaction.id,
        accountBookId: args.accountBookId,
      },
    },
    data: {
      description,
      bookings: {
        update: [
          {
            where: {
              id_accountBookId: {
                id: accountBooking.id,
                accountBookId: args.accountBookId,
              },
            },
            data: {
              date: openingBalancesBookingDate,
              description: "",
              ...bookingUnitFields,
              value: toMoney(targetRawOpeningBalance).toString(),
              sortOrder: 0,
              account: {
                connect: {
                  id_accountBookId: {
                    id: args.account.id,
                    accountBookId: args.accountBookId,
                  },
                },
              },
            },
          },
          {
            where: {
              id_accountBookId: {
                id: openingBalancesBooking.id,
                accountBookId: args.accountBookId,
              },
            },
            data: {
              date: openingBalancesBookingDate,
              description: "",
              ...bookingUnitFields,
              value: toMoney(targetRawOpeningBalance).neg().toString(),
              sortOrder: 1,
            },
          },
        ],
      },
    },
  });

  if (extraBookingIdsOnCanonical.length > 0) {
    await args.tx.booking.deleteMany({
      where: {
        accountBookId: args.accountBookId,
        transactionId: canonicalTransaction.id,
        id: { in: extraBookingIdsOnCanonical },
      },
    });
  }

  if (transactionsToDelete.length > 0) {
    await args.tx.transaction.deleteMany({
      where: {
        accountBookId: args.accountBookId,
        id: { in: transactionsToDelete },
      },
    });
  }
}
