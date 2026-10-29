import { AccountType } from "../../../.prisma-client/enums";
import type { PeriodReadClient } from "./period-read-client";
import type { ExplicitCounterpartAccount } from "../breakdown/period-gains-losses-contributions";

const EXPLICIT_UNATTRIBUTED_MISSING_COUNTERPART_ACCOUNT: ExplicitCounterpartAccount =
  {
    id: "explicit-unattributed:missing-counterpart",
    name: "Unattributed (No Counterpart Account)",
  };
const EXPLICIT_UNATTRIBUTED_MULTIPLE_COUNTERPARTS_ACCOUNT: ExplicitCounterpartAccount =
  {
    id: "explicit-unattributed:multiple-counterparts",
    name: "Unattributed (Multiple Counterpart Accounts)",
  };

export async function resolveExplicitCounterpartNonEquityAccounts(
  args: {
    accountBookId: string;
    explicitTransactionIds: string[];
    byTransactionId: Map<string, ExplicitCounterpartAccount>;
  },
  db: Pick<PeriodReadClient, "booking">,
) {
  const missingTransactionIds = Array.from(
    new Set(
      args.explicitTransactionIds.filter(
        (transactionId) => !args.byTransactionId.has(transactionId),
      ),
    ),
  );
  if (missingTransactionIds.length === 0) {
    return;
  }

  const counterpartBookings = await db.booking.findMany({
    where: {
      accountBookId: args.accountBookId,
      transactionId: { in: missingTransactionIds },
      account: {
        type: {
          in: [AccountType.BALANCE],
        },
      },
    },
    select: {
      transactionId: true,
      accountId: true,
      account: {
        select: {
          name: true,
        },
      },
    },
  });

  const counterpartByTransactionId = new Map<string, Map<string, string>>();
  for (const counterpartBooking of counterpartBookings) {
    const byAccountId = counterpartByTransactionId.getOrInsertComputed(
      counterpartBooking.transactionId,
      () => new Map<string, string>(),
    );
    byAccountId.set(
      counterpartBooking.accountId,
      counterpartBooking.account.name,
    );
  }

  for (const transactionId of missingTransactionIds) {
    const counterpartByAccountId =
      counterpartByTransactionId.get(transactionId) ??
      new Map<string, string>();

    if (counterpartByAccountId.size === 0) {
      args.byTransactionId.set(
        transactionId,
        EXPLICIT_UNATTRIBUTED_MISSING_COUNTERPART_ACCOUNT,
      );
      continue;
    }
    if (counterpartByAccountId.size > 1) {
      args.byTransactionId.set(
        transactionId,
        EXPLICIT_UNATTRIBUTED_MULTIPLE_COUNTERPARTS_ACCOUNT,
      );
      continue;
    }

    const entry = counterpartByAccountId.entries().next().value;
    if (!entry) {
      args.byTransactionId.set(
        transactionId,
        EXPLICIT_UNATTRIBUTED_MISSING_COUNTERPART_ACCOUNT,
      );
      continue;
    }

    const [id, name] = entry;
    args.byTransactionId.set(transactionId, { id, name });
  }
}
