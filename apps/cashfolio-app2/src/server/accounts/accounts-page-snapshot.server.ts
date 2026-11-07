import { prisma } from "../../prisma.server";
import {
  fetchAccountTreeMetadata,
  fetchAccountTreeQueryData,
} from "./accounts-queries-tree-data";
import type { AccountsPageDataInput } from "./accounts-queries-orchestration";

export async function loadAccountsPageSnapshot(data: AccountsPageDataInput) {
  return prisma.$transaction(
    async (db) => {
      await db.$executeRaw`SET TRANSACTION READ ONLY`;
      const metadata = await fetchAccountTreeMetadata(data.accountBookId, db);
      const tree = await fetchAccountTreeQueryData(
        {
          ...data,
          accountState: data.accountState ?? "active",
          includeActionAvailability: true,
        },
        db,
        metadata,
      );
      return { metadata, tree };
    },
    { isolationLevel: "RepeatableRead", timeout: 30_000 },
  );
}
