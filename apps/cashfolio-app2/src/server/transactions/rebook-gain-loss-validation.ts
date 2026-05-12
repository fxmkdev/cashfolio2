import {
  type AccountType,
  type EquityAccountSubtype,
} from "../../.prisma-client/enums";
import { prisma } from "../../prisma.server";
import { validateGainLossSimpleTransactionInvariant } from "../../shared/gain-loss-transaction-invariant";

type AccountTypeMeta = {
  type: AccountType;
  equityAccountSubtype: EquityAccountSubtype | null;
};

export async function validateRebookGainLossSimpleTransactionInvariant(args: {
  accountBookId: string;
  transactionId: string;
  bookingId: string;
  targetAccount: AccountTypeMeta;
}) {
  const transactionBookings = await prisma.booking.findMany({
    where: {
      accountBookId: args.accountBookId,
      transactionId: args.transactionId,
    },
    select: {
      id: true,
      account: {
        select: {
          type: true,
          equityAccountSubtype: true,
        },
      },
    },
  });

  const gainLossInvariantError = validateGainLossSimpleTransactionInvariant(
    transactionBookings.map((transactionBooking) =>
      transactionBooking.id === args.bookingId
        ? args.targetAccount
        : transactionBooking.account,
    ),
  );
  if (gainLossInvariantError) {
    throw new Error(gainLossInvariantError);
  }
}
