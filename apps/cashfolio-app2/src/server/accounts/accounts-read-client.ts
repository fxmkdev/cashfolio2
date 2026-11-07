import type { Prisma } from "../../.prisma-client/client";

/** Reads participating in the account page's owning snapshot transaction. */
export type AccountReadClient = {
  account: Pick<Prisma.TransactionClient["account"], "findMany" | "groupBy">;
  accountGroup: Pick<
    Prisma.TransactionClient["accountGroup"],
    "findMany" | "groupBy"
  >;
  accountBook: Pick<
    Prisma.TransactionClient["accountBook"],
    "findUniqueOrThrow"
  >;
  booking: Pick<Prisma.TransactionClient["booking"], "groupBy">;
};
