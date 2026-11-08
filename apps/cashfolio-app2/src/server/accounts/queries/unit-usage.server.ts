import { prisma } from "../../../prisma.server";
import {
  createAccountBookUnitUsage,
  type AccountBookUnitUsage,
} from "../../../shared/accounts/account-book-unit-usage";

export async function queryActiveAccountBookUnitUsage(
  accountBookId: string,
): Promise<AccountBookUnitUsage> {
  const [accountBook, accounts] = await Promise.all([
    prisma.accountBook.findUniqueOrThrow({
      where: { id: accountBookId },
      select: { referenceCurrency: true },
    }),
    queryActiveAccountUnitUsageAccounts(accountBookId),
  ]);

  return createAccountBookUnitUsage({
    referenceCurrency: accountBook.referenceCurrency,
    accounts,
  });
}

async function queryActiveAccountUnitUsageAccounts(accountBookId: string) {
  return prisma.account.findMany({
    where: {
      accountBookId,
      isActive: true,
    },
    select: {
      isActive: true,
      currency: true,
      cryptocurrency: true,
      tradeCurrency: true,
    },
  });
}
