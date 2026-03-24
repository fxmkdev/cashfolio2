import { createServerFn } from "@tanstack/react-start";
import { prisma } from "../prisma.server";
import { AccountType, EquityAccountSubtype } from "../.prisma-client/enums";
import { isAfter, startOfDay } from "date-fns";
import { getSimpleTransactionUnitIdentifier } from "../shared/account-utils";
import { ensureAuthorizedForAccountBookId } from "../account-books/functions.server";
import { ensureSameOriginRequestFromServerContext } from "../security/same-origin.server";
import { validateRebookBookingTarget } from "./rebook-booking-validation";
import {
  accountTypeMeta,
  buildTransactionCreateData,
  getBookingUnitFields,
  validateAccountTypeBookings,
  validateAccountTypeBookingsWithAccounts,
  validateCreateTransaction,
} from "./transactions-helpers";
import type {
  CreateSimpleTransactionInput,
  CreateTransactionInput,
  RebookBookingInput,
} from "./transactions-types";

export const updateTransaction = createServerFn({ method: "POST" })
  .inputValidator(
    (data: CreateTransactionInput & { transactionId: string }) => data,
  )
  .handler(async ({ data }) => {
    ensureSameOriginRequestFromServerContext();
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
    ensureSameOriginRequestFromServerContext();
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
    ensureSameOriginRequestFromServerContext();
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

    const currentBookingUnitFields = getBookingUnitFields(
      currentAccount,
      "current account",
    );
    const counterBookingUnitFields =
      counterAccount.type === AccountType.EQUITY
        ? currentBookingUnitFields
        : getBookingUnitFields(counterAccount, "counter account");

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
          ...currentBookingUnitFields,
          value: currentValue,
        },
        {
          date: bookingDate.toISOString(),
          accountId: counterAccount.id,
          description: "",
          ...counterBookingUnitFields,
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

export const rebookBooking = createServerFn({ method: "POST" })
  .inputValidator((data: RebookBookingInput) => data)
  .handler(async ({ data }) => {
    ensureSameOriginRequestFromServerContext();
    await ensureAuthorizedForAccountBookId(data.accountBookId);

    const [booking, targetAccount] = await Promise.all([
      prisma.booking.findUnique({
        where: {
          id_accountBookId: {
            id: data.bookingId,
            accountBookId: data.accountBookId,
          },
        },
        select: {
          id: true,
          accountId: true,
          unit: true,
          currency: true,
          cryptocurrency: true,
          symbol: true,
          tradeCurrency: true,
          value: true,
          transactionId: true,
        },
      }),
      prisma.account.findUnique({
        where: {
          id_accountBookId: {
            id: data.targetAccountId,
            accountBookId: data.accountBookId,
          },
        },
        select: {
          id: true,
          isActive: true,
          unit: true,
          currency: true,
          cryptocurrency: true,
          symbol: true,
          tradeCurrency: true,
          type: true,
          equityAccountSubtype: true,
        },
      }),
    ]);

    if (!booking) {
      throw new Error("Booking was not found.");
    }
    if (!targetAccount) {
      throw new Error("Target account was not found.");
    }

    validateRebookBookingTarget({
      booking: {
        accountId: booking.accountId,
        unit: booking.unit,
        currency: booking.currency,
        cryptocurrency: booking.cryptocurrency,
        symbol: booking.symbol,
        tradeCurrency: booking.tradeCurrency,
        value: Number(booking.value),
      },
      targetAccount,
    });

    await prisma.booking.update({
      where: {
        id_accountBookId: {
          id: booking.id,
          accountBookId: data.accountBookId,
        },
      },
      data: {
        account: {
          connect: {
            id_accountBookId: {
              id: targetAccount.id,
              accountBookId: data.accountBookId,
            },
          },
        },
      },
    });

    return { transactionId: booking.transactionId };
  });

export const deleteTransaction = createServerFn({ method: "POST" })
  .inputValidator(
    (data: { transactionId: string; accountBookId: string }) => data,
  )
  .handler(async ({ data }) => {
    ensureSameOriginRequestFromServerContext();
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
