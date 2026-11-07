import { prisma } from "../../../prisma.server";
import {
  fetchAccountTreeMetadata,
  fetchAccountTreeQueryData,
} from "./tree-data.server";
import type { AccountsPageDataInput } from "./types";

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
