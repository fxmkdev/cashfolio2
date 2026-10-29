import { UserRole } from "../.prisma-client/enums";
import {
  lockAuthSubject,
  revokeAuthSubject,
} from "../auth/subject-revocation.server";
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
    const subjectHash = await lockAuthSubject(tx, args.externalId);
    const user = await tx.user.findUnique({
      where: { externalId: args.externalId },
    });
    // Logto-only users and completed retries still need a durable marker.
    if (!user) {
      await revokeAuthSubject(tx, subjectHash);
      return;
    }
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
    await revokeAuthSubject(tx, subjectHash);
  });
}
