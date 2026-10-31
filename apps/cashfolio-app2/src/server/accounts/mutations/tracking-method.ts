import { AccountType, Unit } from "../../../.prisma-client/enums";
import type { Prisma } from "../../../.prisma-client/client";
import type { validateSetAccountsTrackingMethodInput } from "../accounts-input-validation";

export async function setAccountsTrackingMethodOperation(
  data: ReturnType<typeof validateSetAccountsTrackingMethodInput>,
  tx: Prisma.TransactionClient,
) {
  const accounts = await tx.account.findMany({
    where: { accountBookId: data.accountBookId, id: { in: data.accountIds } },
    select: { id: true, type: true, unit: true },
  });
  if (
    accounts.length !== data.accountIds.length ||
    accounts.some(
      (account) =>
        account.type !== AccountType.BALANCE || account.unit !== Unit.CURRENCY,
    )
  ) {
    throw new Error(
      "One or more selected accounts are no longer available as currency accounts in this account book. Refresh and try again.",
    );
  }
  const result = await tx.account.updateMany({
    where: { accountBookId: data.accountBookId, id: { in: data.accountIds } },
    data: { trackingMethod: data.trackingMethod },
  });
  return { data: { count: result.count }, invalidatePeriodCache: true };
}
