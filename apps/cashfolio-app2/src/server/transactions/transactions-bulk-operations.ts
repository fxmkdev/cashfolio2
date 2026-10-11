import type { Prisma } from "../../.prisma-client/client";
import { isOpeningBalancesAccount } from "../../shared/account-utils";
import { OPENING_BALANCES_MANAGEMENT_MESSAGE } from "../../shared/opening-balances";
import { validateGainLossSimpleTransactionInvariant } from "../../shared/gain-loss-transaction-invariant";
import { validateRebookBookingTarget } from "./rebook-booking-validation";
import type {
  DeleteTransactionsInput,
  RebookBookingsInput,
} from "./transactions-types";

const accountSelect = {
  id: true,
  isActive: true,
  type: true,
  equityAccountSubtype: true,
  unit: true,
  currency: true,
  cryptocurrency: true,
  symbol: true,
  tradeCurrency: true,
} as const;

export async function rebookBookingsOperation(
  data: RebookBookingsInput,
  tx: Prisma.TransactionClient,
) {
  const bookings = await tx.booking.findMany({
    where: {
      accountBookId: data.accountBookId,
      id: { in: data.bookingIds },
    },
  });
  if (bookings.length !== data.bookingIds.length) {
    throw new Error(
      "One or more selected bookings no longer exist in this account book. Refresh and try again.",
    );
  }
  const targetAccount = await tx.account.findUnique({
    where: {
      id_accountBookId: {
        id: data.targetAccountId,
        accountBookId: data.accountBookId,
      },
    },
    select: accountSelect,
  });
  if (!targetAccount) throw new Error("Target account was not found.");
  const accountBook = await tx.accountBook.findUniqueOrThrow({
    where: { id: data.accountBookId },
    select: { startDate: true },
  });
  const affectedIds = [
    ...new Set(bookings.map((booking) => booking.transactionId)),
  ];
  const transactionBookings = await tx.booking.findMany({
    where: {
      accountBookId: data.accountBookId,
      transactionId: { in: affectedIds },
    },
    select: {
      id: true,
      transactionId: true,
      account: { select: accountSelect },
    },
  });
  const protectedIds = new Set(
    transactionBookings
      .filter((booking) => isOpeningBalancesAccount(booking.account))
      .map((booking) => booking.transactionId),
  );
  for (const booking of bookings) {
    validateRebookBookingTarget({
      booking,
      targetAccount,
      accountBookStartDate: accountBook.startDate,
      sourceTransactionContainsOpeningBalancesBooking: protectedIds.has(
        booking.transactionId,
      ),
    });
  }
  const selectedIds = new Set(data.bookingIds);
  for (const transactionId of affectedIds) {
    const error = validateGainLossSimpleTransactionInvariant(
      transactionBookings
        .filter((booking) => booking.transactionId === transactionId)
        .map((booking) =>
          selectedIds.has(booking.id) ? targetAccount : booking.account,
        ),
    );
    if (error) throw new Error(error);
  }
  await tx.booking.updateMany({
    where: {
      accountBookId: data.accountBookId,
      id: { in: data.bookingIds },
    },
    data: { accountId: data.targetAccountId },
  });
  return { data: { transactionIds: affectedIds }, invalidatePeriodCache: true };
}

export async function deleteTransactionsOperation(
  data: DeleteTransactionsInput,
  tx: Prisma.TransactionClient,
) {
  const transactions = await tx.transaction.findMany({
    where: {
      accountBookId: data.accountBookId,
      id: { in: data.transactionIds },
    },
    select: {
      id: true,
      bookings: {
        select: {
          account: { select: { type: true, equityAccountSubtype: true } },
        },
      },
    },
  });
  if (transactions.length !== data.transactionIds.length) {
    throw new Error(
      "One or more selected transactions no longer exist in this account book. Refresh and try again.",
    );
  }
  if (
    transactions.some((transaction) =>
      transaction.bookings.some((booking) =>
        isOpeningBalancesAccount(booking.account),
      ),
    )
  ) {
    throw new Error(OPENING_BALANCES_MANAGEMENT_MESSAGE);
  }
  await tx.transaction.deleteMany({
    where: {
      accountBookId: data.accountBookId,
      id: { in: data.transactionIds },
    },
  });
  return { data: undefined, invalidatePeriodCache: true };
}
