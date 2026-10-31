import { writeAssetClass } from "../../classification-data";
import { AccountType } from "../../../.prisma-client/enums";
import type { Prisma } from "../../../.prisma-client/client";
import type { validateSetAccountsAssetClassInput } from "../accounts-input-validation";

export async function setAccountsAssetClassOperation(
  data: ReturnType<typeof validateSetAccountsAssetClassInput>,
  tx: Prisma.TransactionClient,
) {
  const accounts = await tx.account.findMany({
    where: { accountBookId: data.accountBookId, id: { in: data.accountIds } },
    select: { id: true, type: true },
  });
  if (
    accounts.length !== data.accountIds.length ||
    accounts.some((account) => account.type !== AccountType.BALANCE)
  ) {
    throw new Error(
      "One or more selected accounts are no longer available in this account book. Refresh and try again.",
    );
  }
  await writeAssetClass(
    tx,
    data.accountBookId,
    data.accountIds,
    data.assetClassId,
  );
  return { data: { count: accounts.length }, invalidatePeriodCache: true };
}
