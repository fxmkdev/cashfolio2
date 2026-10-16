import { UserRole } from "../.prisma-client/enums";
import {
  FINAL_ADMIN_MESSAGE,
  requireActiveAdmin,
  requireAnotherActiveAdmin,
  withAdminMutation,
} from "./admin-mutation.server";

/** Commit the reservation before touching Logto; failed cleanup stays retryable. */
export function reserveUserDeletion(args: {
  externalId: string;
  currentAdminId?: string;
}): Promise<void> {
  return withAdminMutation(async (tx) => {
    if (args.currentAdminId) await requireActiveAdmin(tx, args.currentAdminId);
    const user = await tx.user.findUnique({
      where: { externalId: args.externalId },
    });
    // An already completed retry or a Logto-only user needs no DB reservation.
    if (!user) return;
    if (args.currentAdminId === user.id)
      throw new Error("You cannot delete yourself.");
    if (!user.deletionPending) {
      if (user.roles.includes(UserRole.ADMIN)) {
        await requireAnotherActiveAdmin(
          tx,
          user.id,
          args.currentAdminId
            ? FINAL_ADMIN_MESSAGE
            : `${FINAL_ADMIN_MESSAGE} Appoint another Admin before deleting your Cashfolio account.`,
        );
      }
      await tx.user.update({
        where: { id: user.id },
        data: { deletionPending: true },
      });
    }
  });
}
