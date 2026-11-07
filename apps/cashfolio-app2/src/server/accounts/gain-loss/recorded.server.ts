import { mapWithConcurrencyLimit } from "../../concurrency";
import { ACCOUNT_GAIN_LOSS_LOOKUP_CONCURRENCY } from "./prefetch.server";
import { EquityAccountSubtype } from "../../../.prisma-client/enums";
import type {
  AccountGainLossDiagnostic,
  AccountGainLossResult,
} from "../../../shared/account-gain-loss";
import type { AccountGainLossSourceRow } from "../../../shared/gain-loss-reconciliation";
import { moneyAdd, toMoney, type Money } from "../../../shared/money";
import type { PeriodReadClient } from "../../period/base-data/period-read-client";
import { loadPeriodEquityBookingsRaw } from "../../period/base-data/period-base-data-equity-bookings.server";
import { resolveExplicitCounterpartNonEquityAccounts } from "../../period/base-data/period-base-data-explicit-counterparts.server";
import type { ExplicitCounterpartAccount } from "../../period/breakdown/period-gains-losses-contributions";

export type RecordedAccountGainLoss = {
  accountId: string;
  amount: Money | null;
  diagnostics: AccountGainLossDiagnostic[];
};

/** Attribution follows the equity booking date, even when its counterpart has another date. */
export async function loadRecordedAccountGainLossInputs(
  args: {
    accountBookId: string;
    queryStart: Date;
    queryEndExclusive: Date;
    counterpartAccountId?: string;
  },
  db: Pick<PeriodReadClient, "booking">,
) {
  const bookings =
    args.queryEndExclusive <= args.queryStart
      ? []
      : await loadPeriodEquityBookingsRaw(
          {
            ...args,
            equityAccountById: new Map(),
            equityAccountIds: [],
            equityAccountSubtype: EquityAccountSubtype.GAIN_LOSS,
          },
          db,
        );
  const counterparts = new Map<string, ExplicitCounterpartAccount>();
  await resolveExplicitCounterpartNonEquityAccounts(
    {
      accountBookId: args.accountBookId,
      explicitTransactionIds: bookings.map((booking) => booking.transactionId),
      byTransactionId: counterparts,
    },
    db,
  );
  return { bookings, counterparts };
}

type RecordedGainLossInputs = Awaited<
  ReturnType<typeof loadRecordedAccountGainLossInputs>
>;

export async function calculateRecordedAccountGainLoss(args: {
  inputs: RecordedGainLossInputs;
  accountIds: Set<string>;
  detailAccountId?: string;
  convertBookingToReference: (
    booking: RecordedGainLossInputs["bookings"][number],
  ) => Promise<Money | null>;
}) {
  const byAccountId = new Map<string, RecordedAccountGainLoss>();
  const recordedAdjustments: AccountGainLossSourceRow<Money>[] = [];
  const attributedBookings = args.inputs.bookings.flatMap((booking) => {
    const accountId = args.inputs.counterparts.get(booking.transactionId)?.id;
    return accountId && args.accountIds.has(accountId)
      ? [{ booking, accountId }]
      : [];
  });
  const convertedBookings = await mapWithConcurrencyLimit(
    attributedBookings,
    ACCOUNT_GAIN_LOSS_LOOKUP_CONCURRENCY,
    async ({ booking, accountId }) => ({
      booking,
      accountId,
      converted: await args.convertBookingToReference(booking),
    }),
  );
  for (const { booking, accountId, converted } of convertedBookings) {
    const entry = byAccountId.getOrInsertComputed(accountId, () => ({
      accountId,
      amount: toMoney(0),
      diagnostics: [],
    }));
    if (converted === null) {
      entry.amount = null;
      entry.diagnostics.push({
        date: booking.date.toISOString(),
        message:
          "A recorded G/L adjustment could not be converted. Realised and Total G/L are unavailable.",
      });
      continue;
    }
    const amount = toMoney(converted).neg();
    if (entry.amount !== null) entry.amount = moneyAdd(entry.amount, amount);
    if (accountId === args.detailAccountId)
      recordedAdjustments.push({
        id: booking.id,
        date: booking.date.toISOString(),
        transactionId: booking.transactionId,
        description:
          booking.description ?? booking.transactionDescription ?? null,
        amount,
      });
  }
  recordedAdjustments.sort(
    (a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id),
  );
  return { recordedGainLoss: [...byAccountId.values()], recordedAdjustments };
}

export function applyRecordedAccountGainLoss(
  results: Map<string, AccountGainLossResult<Money>>,
  recordedGainLoss: RecordedAccountGainLoss[],
) {
  for (const entry of recordedGainLoss) {
    const result = results.get(entry.accountId);
    if (!result) continue;
    if (!result.applicable) {
      result.applicable = true;
      result.summary = {
        realizedGainLoss: toMoney(0),
        unrealizedGainLoss: toMoney(0),
        totalGainLoss: toMoney(0),
      };
    }
    const calculated = result.summary.realizedGainLoss;
    result.summary.realizedGainLoss =
      calculated === null || entry.amount === null
        ? null
        : moneyAdd(calculated, entry.amount);
    const { realizedGainLoss, unrealizedGainLoss } = result.summary;
    result.summary.totalGainLoss =
      realizedGainLoss === null || unrealizedGainLoss === null
        ? null
        : moneyAdd(realizedGainLoss, unrealizedGainLoss);
    result.diagnostics.push(...entry.diagnostics);
  }
}
