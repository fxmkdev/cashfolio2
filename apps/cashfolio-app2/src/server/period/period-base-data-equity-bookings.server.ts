import { toMoney } from "../../shared/money";
import { AccountType, EquityAccountSubtype } from "../../.prisma-client/enums";
import { prisma } from "../../prisma.server";

import type { PeriodBaseEquityBooking } from "./period-base-data-types";

const EQUITY_BOOKINGS_PAGE_SIZE = 1_000;

type EquityAccountMetadata = {
  id: string;
  name: string;
  groupId: string | null;
  equityAccountSubtype: EquityAccountSubtype | null;
};

type ResolvedEquityBookingAccount = EquityAccountMetadata & {
  equityAccountSubtype: EquityAccountSubtype;
};

type LoadPeriodEquityBookingsRawArgs = {
  accountBookId: string;
  queryStart: Date;
  queryEndExclusive: Date;
  equityAccountById: Map<string, EquityAccountMetadata>;
  equityAccountIds: string[];
};

export async function loadPeriodEquityBookingsRaw(
  args: LoadPeriodEquityBookingsRawArgs,
): Promise<PeriodBaseEquityBooking[]> {
  const results: PeriodBaseEquityBooking[] = [];
  let nextBookingIdCursor: string | undefined;

  while (true) {
    const bookingsPage = await loadPeriodEquityBookingsPage({
      ...args,
      nextBookingIdCursor,
    });
    if (bookingsPage.length === 0) {
      break;
    }

    results.push(
      ...bookingsPage.map((booking) =>
        mapPeriodEquityBooking({
          booking,
          equityAccountById: args.equityAccountById,
        }),
      ),
    );

    nextBookingIdCursor = bookingsPage[bookingsPage.length - 1].id;
    if (bookingsPage.length < EQUITY_BOOKINGS_PAGE_SIZE) {
      break;
    }
  }

  return results;
}

type PeriodEquityBookingsPage = Awaited<
  ReturnType<typeof loadPeriodEquityBookingsPage>
>;
type PeriodEquityBookingPageRow = PeriodEquityBookingsPage[number];

async function loadPeriodEquityBookingsPage(
  args: LoadPeriodEquityBookingsRawArgs & {
    nextBookingIdCursor: string | undefined;
  },
) {
  const usesPreloadedEquityAccountFilter = args.equityAccountIds.length > 0;
  return prisma.booking.findMany({
    where: getEquityBookingsWhere({
      ...args,
      usesPreloadedEquityAccountFilter,
    }),
    orderBy: { id: "asc" },
    take: EQUITY_BOOKINGS_PAGE_SIZE,
    ...(args.nextBookingIdCursor
      ? {
          cursor: {
            id_accountBookId: {
              id: args.nextBookingIdCursor,
              accountBookId: args.accountBookId,
            },
          },
          skip: 1,
        }
      : {}),
    select: getEquityBookingSelect(usesPreloadedEquityAccountFilter),
  });
}

function getEquityBookingsWhere(
  args: LoadPeriodEquityBookingsRawArgs & {
    usesPreloadedEquityAccountFilter: boolean;
  },
) {
  return {
    accountBookId: args.accountBookId,
    date: {
      gte: args.queryStart,
      lt: args.queryEndExclusive,
    },
    ...(args.usesPreloadedEquityAccountFilter
      ? {
          accountId: {
            in: args.equityAccountIds,
          },
        }
      : {
          account: {
            type: AccountType.EQUITY,
            equityAccountSubtype: {
              in: [
                EquityAccountSubtype.INCOME,
                EquityAccountSubtype.EXPENSE,
                EquityAccountSubtype.GAIN_LOSS,
              ],
            },
          },
        }),
  };
}

function getEquityBookingSelect(usesPreloadedEquityAccountFilter: boolean) {
  return {
    id: true,
    accountId: true,
    transactionId: true,
    date: true,
    value: true,
    unit: true,
    currency: true,
    cryptocurrency: true,
    symbol: true,
    tradeCurrency: true,
    ...(usesPreloadedEquityAccountFilter
      ? {}
      : {
          account: {
            select: {
              id: true,
              name: true,
              groupId: true,
              equityAccountSubtype: true,
            },
          },
        }),
  };
}

function mapPeriodEquityBooking(args: {
  booking: PeriodEquityBookingPageRow;
  equityAccountById: Map<string, EquityAccountMetadata>;
}): PeriodBaseEquityBooking {
  const bookingAccountId = args.booking.accountId ?? args.booking.account?.id;
  if (!bookingAccountId) {
    throw new Error(
      "Equity booking invariant violated: booking is missing accountId.",
    );
  }

  const account = resolveEquityBookingAccount({
    booking: args.booking,
    bookingAccountId,
    equityAccountById: args.equityAccountById,
  });
  if (!account) {
    throw new Error(
      `Equity booking invariant violated for account ${bookingAccountId}: missing preloaded equity account metadata.`,
    );
  }

  return {
    id: args.booking.id,
    accountId: bookingAccountId,
    accountName: account.name,
    accountGroupId: account.groupId,
    equityAccountSubtype: account.equityAccountSubtype,
    transactionId: args.booking.transactionId,
    date: args.booking.date,
    value: toMoney(args.booking.value),
    unit: args.booking.unit,
    currency: args.booking.currency,
    cryptocurrency: args.booking.cryptocurrency,
    symbol: args.booking.symbol,
    tradeCurrency: args.booking.tradeCurrency,
  };
}

function resolveEquityBookingAccount(args: {
  booking: PeriodEquityBookingPageRow;
  bookingAccountId: string;
  equityAccountById: Map<string, EquityAccountMetadata>;
}): ResolvedEquityBookingAccount | null {
  const preloadedAccount = args.equityAccountById.get(args.bookingAccountId);
  if (isSupportedEquityAccount(preloadedAccount)) {
    return preloadedAccount;
  }

  const selectedAccount = args.booking.account;
  if (isSupportedEquityAccount(selectedAccount)) {
    return {
      id: selectedAccount.id,
      name: selectedAccount.name,
      groupId: selectedAccount.groupId ?? null,
      equityAccountSubtype: selectedAccount.equityAccountSubtype,
    };
  }

  return null;
}

function isSupportedEquityAccount(
  account: EquityAccountMetadata | null | undefined,
): account is ResolvedEquityBookingAccount {
  return (
    account?.equityAccountSubtype === EquityAccountSubtype.INCOME ||
    account?.equityAccountSubtype === EquityAccountSubtype.EXPENSE ||
    account?.equityAccountSubtype === EquityAccountSubtype.GAIN_LOSS
  );
}
