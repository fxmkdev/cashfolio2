import { createId } from "@paralleldrive/cuid2";
import type { Prisma, PrismaClient } from "../.prisma-client/client";
import {
  AccountType,
  EquityAccountSubtype,
  UserRole,
} from "../.prisma-client/enums";
import { GAIN_LOSS_ACCOUNT_KEY, type SeedDataset } from "./dataset";
import {
  SeedSafetyError,
  verifyServerIdentity,
  type ApprovedSeedTarget,
} from "./target";

export type SeedSummary = {
  from: string;
  through: string;
  testers: number;
  books: Array<{
    key: string;
    id: string;
    name: string;
    accounts: number;
    transactions: number;
    bookings: number;
  }>;
};

const BATCH_SIZE = 500;

export async function insertSeedBooks(
  tx: Prisma.TransactionClient,
  dataset: SeedDataset,
  users: { id: string }[],
): Promise<SeedSummary> {
  const summary: SeedSummary = {
    from: dataset.books[0].startDate.toISOString().slice(0, 10),
    through: dataset.today.toISOString().slice(0, 10),
    testers: users.length,
    books: [],
  };
  for (const book of dataset.books) {
    const accountBookId = createId();
    await tx.accountBook.create({
      data: {
        id: accountBookId,
        name: book.name,
        referenceCurrency: book.referenceCurrency,
        startDate: book.startDate,
      },
    });
    const systemAccounts = await tx.account.findMany({
      where: {
        accountBookId,
        type: AccountType.EQUITY,
        equityAccountSubtype: EquityAccountSubtype.GAIN_LOSS,
      },
      select: { id: true },
    });
    if (systemAccounts.length !== 1) {
      throw new Error(
        "The database must create exactly one Gain/Loss account per book.",
      );
    }
    const groups = new Map(book.groups.map((group) => [group.key, createId()]));
    const accounts = new Map(
      book.accounts.map((account) => [account.key, createId()]),
    );
    accounts.set(GAIN_LOSS_ACCOUNT_KEY, systemAccounts[0].id);
    const getId = (ids: Map<string, string>, key: string): string => {
      const id = ids.get(key);
      if (!id) throw new Error("The seed references an unknown logical key.");
      return id;
    };
    if (book.groups.length) {
      await tx.accountGroup.createMany({
        data: book.groups.map(({ key, parentKey, ...group }) => ({
          ...group,
          id: getId(groups, key),
          parentGroupId: parentKey ? getId(groups, parentKey) : null,
          accountBookId,
        })),
      });
    }
    if (book.accounts.length) {
      await tx.account.createMany({
        data: book.accounts.map(
          ({ key, groupKey, statementImportCsvFormat, ...account }) => ({
            ...account,
            id: getId(accounts, key),
            groupId: groupKey ? getId(groups, groupKey) : null,
            accountBookId,
            ...(statementImportCsvFormat
              ? {
                  statementImportCsvFormat:
                    statementImportCsvFormat as Prisma.InputJsonObject,
                }
              : {}),
          }),
        ),
      });
    }
    let bookingCount = 0;
    for (
      let offset = 0;
      offset < book.transactions.length;
      offset += BATCH_SIZE
    ) {
      const transactions = book.transactions
        .slice(offset, offset + BATCH_SIZE)
        .map((transaction) => ({ ...transaction, id: createId() }));
      await tx.transaction.createMany({
        data: transactions.map(({ id, description }) => ({
          id,
          description,
          accountBookId,
        })),
      });
      const bookings = transactions.flatMap(({ id: transactionId, bookings }) =>
        bookings.map(({ accountKey, ...booking }) => ({
          ...booking,
          id: createId(),
          accountId: getId(accounts, accountKey),
          transactionId,
          accountBookId,
        })),
      );
      for (
        let bookingOffset = 0;
        bookingOffset < bookings.length;
        bookingOffset += BATCH_SIZE
      ) {
        await tx.booking.createMany({
          data: bookings.slice(bookingOffset, bookingOffset + BATCH_SIZE),
        });
      }
      bookingCount += bookings.length;
    }
    await tx.userAccountBookLink.createMany({
      data: users.map(({ id: userId }) => ({ userId, accountBookId })),
    });
    summary.books.push({
      key: book.key,
      id: accountBookId,
      name: book.name,
      accounts: book.accounts.length + 1,
      transactions: book.transactions.length,
      bookings: bookingCount,
    });
  }
  return summary;
}

export async function replaceStagingData(
  prisma: PrismaClient,
  config: { target: ApprovedSeedTarget; testerExternalIds: string[] },
  dataset: SeedDataset,
): Promise<SeedSummary> {
  if (
    !config.testerExternalIds.length ||
    config.testerExternalIds.some((id) => !id.trim())
  ) {
    throw new SeedSafetyError(
      "At least one configured tester is required before replacement.",
    );
  }
  return prisma.$transaction(
    async (tx) => {
      await verifyServerIdentity(tx, config.target);
      // Serialize manual invocations as well as deployment releases.
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(216177609, 1)::text`;
      // Existing app machines remain live during a Fly release. Hold write locks
      // for every replacement table so app mutations cannot slip between deletes.
      // Reads can continue until the complete replacement commits.
      await tx.$executeRaw`
        LOCK TABLE "User", "AccountBook", "UserAccountBookLink", "AccountGroup",
          "Account", "Transaction", "Booking" IN SHARE ROW EXCLUSIVE MODE
      `;
      const retainedAdmins = await tx.user.count({
        where: {
          externalId: { in: config.testerExternalIds },
          roles: { has: UserRole.ADMIN },
        },
      });
      if (!retainedAdmins) {
        throw new SeedSafetyError(
          "Configured testers must include an existing staging administrator before replacement.",
        );
      }
      await tx.booking.deleteMany();
      await tx.transaction.deleteMany();
      await tx.account.deleteMany();
      await tx.accountGroup.updateMany({ data: { parentGroupId: null } });
      await tx.accountGroup.deleteMany();
      await tx.userAccountBookLink.deleteMany();
      await tx.accountBook.deleteMany();
      await tx.user.deleteMany({
        where: { externalId: { notIn: config.testerExternalIds } },
      });
      const users = [];
      for (const externalId of config.testerExternalIds) {
        users.push(
          await tx.user.upsert({
            where: { externalId },
            update: {},
            create: { id: createId(), externalId, locale: "en-CH", roles: [] },
            select: { id: true },
          }),
        );
      }
      return insertSeedBooks(tx, dataset, users);
    },
    { maxWait: 20_000, timeout: 120_000 },
  );
}
