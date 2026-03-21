import { createServerFn } from "@tanstack/react-start";
import { prisma } from "../prisma.server";
import {
  AccountType,
  EquityAccountSubtype,
  Unit,
} from "../.prisma-client/enums";
import { isAfter, startOfDay } from "date-fns";
import {
  getSimpleTransactionUnitIdentifier,
  getUnitIdentifier,
} from "../shared/account-utils";
import { ensureAuthorizedForAccountBookId } from "../account-books/functions.server";

export type CreateTransactionInput = {
  accountBookId: string;
  description: string;
  bookings: {
    date: string;
    accountId: string;
    description: string;
    unit: Unit;
    currency?: string;
    cryptocurrency?: string;
    symbol?: string;
    tradeCurrency?: string;
    value: number;
  }[];
};

export type CreateSimpleTransactionInput = {
  accountBookId: string;
  accountId: string;
  date: string;
  description: string;
  counterAccountId: string;
  amount: number;
  direction: "DEBIT" | "CREDIT";
};

function validateCreateTransaction(input: CreateTransactionInput) {
  const errors: string[] = [];
  const today = startOfDay(new Date());

  if (input.bookings.length < 2) {
    errors.push("At least two bookings are required.");
  }

  for (let i = 0; i < input.bookings.length; i++) {
    const b = input.bookings[i];
    const date = new Date(b.date);
    if (isNaN(date.getTime())) {
      errors.push(`Booking ${i}: invalid date.`);
    } else if (isAfter(startOfDay(date), today)) {
      errors.push(`Booking ${i}: date cannot be in the future.`);
    }

    if (!b.accountId) {
      errors.push(`Booking ${i}: account is required.`);
    }

    if (!b.unit) {
      errors.push(`Booking ${i}: unit is required.`);
    } else if (b.unit === Unit.CURRENCY && !b.currency) {
      errors.push(`Booking ${i}: currency is required.`);
    } else if (b.unit === Unit.CRYPTOCURRENCY && !b.cryptocurrency) {
      errors.push(`Booking ${i}: cryptocurrency is required.`);
    } else if (b.unit === Unit.SECURITY && !b.symbol) {
      errors.push(`Booking ${i}: symbol is required.`);
    }

    if (b.value === 0) {
      errors.push(`Booking ${i}: value must be non-zero.`);
    }
  }

  if (errors.length === 0 && input.bookings.length >= 2) {
    const unitIdentifiers = new Set(
      input.bookings.map((b) => getUnitIdentifier(b)),
    );
    if (unitIdentifiers.size === 1) {
      const sum = input.bookings.reduce((acc, b) => acc + b.value, 0);
      if (Math.abs(sum) > 0.001) {
        errors.push("The sum of all bookings must be zero.");
      }
    }
  }

  if (errors.length > 0) {
    throw new Error(errors.join(" "));
  }
}

async function validateAccountTypeBookings(
  bookings: { accountId: string; value: number }[],
  accountBookId: string,
) {
  const accountIds = bookings.map((b) => b.accountId).filter(Boolean);
  if (accountIds.length === 0) return;

  const accounts = await prisma.account.findMany({
    where: { id: { in: accountIds }, accountBookId },
    select: { id: true, type: true, equityAccountSubtype: true },
  });
  const accountMap = new Map(
    accounts.map((account) => [account.id, accountTypeMeta(account)]),
  );
  validateAccountTypeBookingsWithAccounts(bookings, accountMap);
}

type AccountTypeMeta = {
  id: string;
  type: AccountType;
  equityAccountSubtype: EquityAccountSubtype | null;
};

function accountTypeMeta(account: {
  id: string;
  type: AccountType;
  equityAccountSubtype: EquityAccountSubtype | null;
}): AccountTypeMeta {
  return {
    id: account.id,
    type: account.type,
    equityAccountSubtype: account.equityAccountSubtype,
  };
}

function validateAccountTypeBookingsWithAccounts(
  bookings: { accountId: string; value: number }[],
  accountMap: Map<string, AccountTypeMeta>,
) {
  const errors: string[] = [];
  for (let i = 0; i < bookings.length; i++) {
    const b = bookings[i];
    const account = accountMap.get(b.accountId);
    if (!account) continue;

    if (
      account.type === AccountType.EQUITY &&
      account.equityAccountSubtype === EquityAccountSubtype.INCOME &&
      b.value > 0
    ) {
      errors.push(`Booking ${i}: Income accounts cannot have debit entries.`);
    }

    if (
      account.type === AccountType.EQUITY &&
      account.equityAccountSubtype === EquityAccountSubtype.EXPENSE &&
      b.value < 0
    ) {
      errors.push(`Booking ${i}: Expense accounts cannot have credit entries.`);
    }
  }

  if (errors.length > 0) {
    throw new Error(errors.join(" "));
  }
}

function buildTransactionCreateData(input: CreateTransactionInput) {
  return {
    description: input.description,
    accountBookId: input.accountBookId,
    bookings: {
      create: input.bookings.map((booking, sortOrder) => ({
        date: new Date(booking.date),
        description: booking.description,
        account: {
          connect: {
            id_accountBookId: {
              id: booking.accountId,
              accountBookId: input.accountBookId,
            },
          },
        },
        unit: booking.unit,
        currency: booking.currency,
        cryptocurrency: booking.cryptocurrency,
        symbol: booking.symbol,
        tradeCurrency: booking.tradeCurrency,
        value: booking.value,
        sortOrder,
        accountBook: {
          connect: { id: input.accountBookId },
        },
      })),
    },
  };
}

type SimpleUnitFields = {
  unit: Unit | null;
  currency: string | null;
  cryptocurrency: string | null;
  symbol: string | null;
  tradeCurrency: string | null;
};

function getBookingUnitFields(account: SimpleUnitFields): {
  unit: Unit;
  currency?: string;
  cryptocurrency?: string;
  symbol?: string;
  tradeCurrency?: string;
} {
  if (!account.unit) {
    throw new Error("Current account must define a unit.");
  }

  if (account.unit === Unit.CURRENCY) {
    if (!account.currency)
      throw new Error("Current account currency is missing.");
    return { unit: Unit.CURRENCY, currency: account.currency };
  }

  if (account.unit === Unit.CRYPTOCURRENCY) {
    if (!account.cryptocurrency) {
      throw new Error("Current account cryptocurrency is missing.");
    }
    return {
      unit: Unit.CRYPTOCURRENCY,
      cryptocurrency: account.cryptocurrency,
    };
  }

  if (!account.symbol) {
    throw new Error("Current account symbol is missing.");
  }
  if (!account.tradeCurrency) {
    throw new Error("Current account trade currency is missing.");
  }
  return {
    unit: Unit.SECURITY,
    symbol: account.symbol,
    tradeCurrency: account.tradeCurrency,
  };
}

export const getTransaction = createServerFn({ method: "GET" })
  .inputValidator(
    (data: { transactionId: string; accountBookId: string }) => data,
  )
  .handler(async ({ data }) => {
    await ensureAuthorizedForAccountBookId(data.accountBookId);
    const transaction = await prisma.transaction.findUniqueOrThrow({
      where: {
        id_accountBookId: {
          id: data.transactionId,
          accountBookId: data.accountBookId,
        },
      },
      include: {
        bookings: {
          orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
        },
      },
    });

    return {
      id: transaction.id,
      description: transaction.description,
      bookings: transaction.bookings.map((b) => {
        const value = Number(b.value);
        return {
          date: b.date.toISOString(),
          account: b.accountId,
          description: b.description,
          unit: b.unit as Unit,
          currency: b.currency ?? undefined,
          cryptocurrency: b.cryptocurrency ?? undefined,
          symbol: b.symbol ?? undefined,
          tradeCurrency: b.tradeCurrency ?? undefined,
          debit: value > 0 ? value : undefined,
          credit: value < 0 ? -value : undefined,
        };
      }),
    };
  });

export const updateTransaction = createServerFn({ method: "POST" })
  .inputValidator(
    (data: CreateTransactionInput & { transactionId: string }) => data,
  )
  .handler(async ({ data }) => {
    await ensureAuthorizedForAccountBookId(data.accountBookId);
    validateCreateTransaction(data);
    await validateAccountTypeBookings(data.bookings, data.accountBookId);

    await prisma.$transaction([
      prisma.booking.deleteMany({
        where: {
          transactionId: data.transactionId,
          accountBookId: data.accountBookId,
        },
      }),
      prisma.transaction.update({
        where: {
          id_accountBookId: {
            id: data.transactionId,
            accountBookId: data.accountBookId,
          },
        },
        data: {
          description: data.description,
          bookings: {
            create: data.bookings.map((b, sortOrder) => ({
              date: new Date(b.date),
              description: b.description,
              account: {
                connect: {
                  id_accountBookId: {
                    id: b.accountId,
                    accountBookId: data.accountBookId,
                  },
                },
              },
              unit: b.unit,
              currency: b.currency,
              cryptocurrency: b.cryptocurrency,
              symbol: b.symbol,
              tradeCurrency: b.tradeCurrency,
              value: b.value,
              sortOrder,
              accountBook: {
                connect: { id: data.accountBookId },
              },
            })),
          },
        },
      }),
    ]);
  });

export const createTransaction = createServerFn({ method: "POST" })
  .inputValidator((data: CreateTransactionInput) => data)
  .handler(async ({ data }) => {
    await ensureAuthorizedForAccountBookId(data.accountBookId);
    validateCreateTransaction(data);
    await validateAccountTypeBookings(data.bookings, data.accountBookId);

    const transaction = await prisma.transaction.create({
      data: buildTransactionCreateData(data),
    });

    return transaction;
  });

export const createSimpleTransaction = createServerFn({ method: "POST" })
  .inputValidator((data: CreateSimpleTransactionInput) => data)
  .handler(async ({ data }) => {
    await ensureAuthorizedForAccountBookId(data.accountBookId);

    if (!Number.isFinite(data.amount) || data.amount <= 0) {
      throw new Error("Amount must be greater than zero.");
    }
    if (data.direction !== "DEBIT" && data.direction !== "CREDIT") {
      throw new Error("Direction must be either DEBIT or CREDIT.");
    }

    if (typeof data.date !== "string" || data.date.trim() === "") {
      throw new Error("Date is required.");
    }

    const bookingDate = new Date(data.date);
    const today = startOfDay(new Date());

    if (isNaN(bookingDate.getTime())) {
      throw new Error("Date is invalid.");
    }
    if (isAfter(startOfDay(bookingDate), today)) {
      throw new Error("Date cannot be in the future.");
    }

    if (data.accountId === data.counterAccountId) {
      throw new Error(
        "Counter account must be different from the current account.",
      );
    }

    const accounts = await prisma.account.findMany({
      where: {
        accountBookId: data.accountBookId,
        id: { in: [data.accountId, data.counterAccountId] },
      },
      select: {
        id: true,
        type: true,
        equityAccountSubtype: true,
        unit: true,
        currency: true,
        cryptocurrency: true,
        symbol: true,
        tradeCurrency: true,
        isActive: true,
      },
    });

    const currentAccount = accounts.find(
      (account) => account.id === data.accountId,
    );
    const counterAccount = accounts.find(
      (account) => account.id === data.counterAccountId,
    );

    if (!currentAccount) {
      throw new Error("Current account was not found.");
    }
    if (!counterAccount) {
      throw new Error("Counter account was not found.");
    }

    if (
      currentAccount.type !== AccountType.ASSET &&
      currentAccount.type !== AccountType.LIABILITY
    ) {
      throw new Error(
        "Simple transactions are only allowed for asset or liability accounts.",
      );
    }

    if (!counterAccount.isActive) {
      throw new Error("Counter account must be active.");
    }

    const currentUnitIdentifier =
      getSimpleTransactionUnitIdentifier(currentAccount);
    if (!currentUnitIdentifier) {
      throw new Error("Current account unit details are incomplete.");
    }

    if (
      counterAccount.type !== AccountType.EQUITY &&
      counterAccount.type !== AccountType.ASSET &&
      counterAccount.type !== AccountType.LIABILITY
    ) {
      throw new Error("Account type is not supported for simple transactions.");
    }

    if (
      counterAccount.type === AccountType.ASSET ||
      counterAccount.type === AccountType.LIABILITY
    ) {
      const counterUnitIdentifier =
        getSimpleTransactionUnitIdentifier(counterAccount);
      if (!counterUnitIdentifier) {
        throw new Error("Counter account unit details are incomplete.");
      }
      if (counterUnitIdentifier !== currentUnitIdentifier) {
        throw new Error(
          "Asset and liability accounts must use the same unit as the current account.",
        );
      }
    }

    if (
      counterAccount.type === AccountType.EQUITY &&
      counterAccount.equityAccountSubtype === EquityAccountSubtype.INCOME &&
      data.direction !== "DEBIT"
    ) {
      throw new Error(
        "Income accounts require a debit on the current account.",
      );
    }
    if (
      counterAccount.type === AccountType.EQUITY &&
      counterAccount.equityAccountSubtype === EquityAccountSubtype.EXPENSE &&
      data.direction !== "CREDIT"
    ) {
      throw new Error(
        "Expense accounts require a credit on the current account.",
      );
    }

    const bookingUnitFields = getBookingUnitFields(currentAccount);

    const currentValue =
      data.direction === "DEBIT" ? data.amount : -data.amount;
    const createInput: CreateTransactionInput = {
      accountBookId: data.accountBookId,
      description: data.description,
      bookings: [
        {
          date: bookingDate.toISOString(),
          accountId: currentAccount.id,
          description: "",
          ...bookingUnitFields,
          value: currentValue,
        },
        {
          date: bookingDate.toISOString(),
          accountId: counterAccount.id,
          description: "",
          ...bookingUnitFields,
          value: -currentValue,
        },
      ],
    };

    validateCreateTransaction(createInput);
    const accountMap = new Map(
      [currentAccount, counterAccount].map((account) => [
        account.id,
        accountTypeMeta(account),
      ]),
    );
    validateAccountTypeBookingsWithAccounts(createInput.bookings, accountMap);

    const transaction = await prisma.transaction.create({
      data: buildTransactionCreateData(createInput),
    });

    return transaction;
  });

export const deleteTransaction = createServerFn({ method: "POST" })
  .inputValidator(
    (data: { transactionId: string; accountBookId: string }) => data,
  )
  .handler(async ({ data }) => {
    await ensureAuthorizedForAccountBookId(data.accountBookId);
    await prisma.transaction.delete({
      where: {
        id_accountBookId: {
          id: data.transactionId,
          accountBookId: data.accountBookId,
        },
      },
    });
  });
