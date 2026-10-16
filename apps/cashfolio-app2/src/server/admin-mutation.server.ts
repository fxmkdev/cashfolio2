import { Prisma } from "../.prisma-client/client";
import { UserRole } from "../.prisma-client/enums";
import { prisma } from "../prisma.server";
import { withDatabaseConflictRetry } from "./database-conflict-retry";

export const FINAL_ADMIN_MESSAGE = "At least one Admin user is required.";
export const DELETION_PENDING_MESSAGE =
  "Cashfolio account deletion is pending. Retry deletion to finish it.";

/** Serialize app-owned Admin membership changes across processes and users. */
export function withAdminMutation<T>(
  operation: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  return withDatabaseConflictRetry(() =>
    prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SET LOCAL lock_timeout = '25s'`;
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(1128351308, 1)::text`;
        return operation(tx);
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
        timeout: 30_000,
      },
    ),
  );
}

export async function requireActiveAdmin(
  tx: Prisma.TransactionClient,
  userId: string,
) {
  const actor = await tx.user.findUnique({ where: { id: userId } });
  if (
    !actor ||
    actor.deletionPending ||
    !actor.roles.includes(UserRole.ADMIN)
  ) {
    throw new Response("Forbidden", { status: 403 });
  }
  return actor;
}

export async function requireAnotherActiveAdmin(
  tx: Prisma.TransactionClient,
  targetUserId: string,
  message = FINAL_ADMIN_MESSAGE,
) {
  const remaining = await tx.user.count({
    where: {
      id: { not: targetUserId },
      roles: { has: UserRole.ADMIN },
      deletionPending: false,
    },
  });
  if (remaining === 0) throw new Error(message);
}
