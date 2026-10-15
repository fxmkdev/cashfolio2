import type { Prisma } from "../../../.prisma-client/client";

/** Database reads that must share the owning period snapshot transaction. */
export type PeriodReadClient = {
  accountBook: Pick<
    Prisma.TransactionClient["accountBook"],
    "findUniqueOrThrow"
  >;
  accountGroup: Pick<Prisma.TransactionClient["accountGroup"], "findMany">;
  account: Pick<Prisma.TransactionClient["account"], "findMany">;
  booking: Pick<Prisma.TransactionClient["booking"], "groupBy" | "findMany">;
  transaction: Pick<Prisma.TransactionClient["transaction"], "findMany">;
};
