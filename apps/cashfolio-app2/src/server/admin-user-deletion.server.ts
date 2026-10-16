import { prisma } from "../prisma.server";
import { deleteUserData } from "./user-deletion.server";
import { loadLogtoIdentity } from "./admin-user-identities.server";

export type DeleteAdminUserInput = {
  userId: string;
  confirmation: string;
};

function isDeleteConfirmationMatch(args: {
  confirmation: string;
  externalId: string;
  email: string | null;
}): boolean {
  const confirmation = args.confirmation.trim();
  const requiredConfirmation = args.email ?? args.externalId;
  return confirmation === requiredConfirmation;
}

export async function deleteAdminUserById(args: {
  currentAdminId: string;
  data: DeleteAdminUserInput;
}): Promise<void> {
  const targetUser = await prisma.user.findUnique({
    where: { id: args.data.userId },
    select: { id: true, externalId: true },
  });

  if (!targetUser) {
    throw new Error("User not found.");
  }

  if (targetUser.id === args.currentAdminId) {
    throw new Error("You cannot delete yourself.");
  }

  const identity = await loadLogtoIdentity(targetUser);
  if (identity.status === "unavailable") {
    throw new Error(
      "Cannot delete user because the Logto identity is unavailable.",
    );
  }

  if (
    !isDeleteConfirmationMatch({
      confirmation: args.data.confirmation,
      externalId: targetUser.externalId,
      email: identity.email,
    })
  ) {
    throw new Error("Confirmation does not match the user.");
  }

  await deleteUserData({
    externalId: targetUser.externalId,
    currentAdminId: args.currentAdminId,
  });
}
