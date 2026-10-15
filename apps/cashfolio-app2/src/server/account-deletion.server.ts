import type { LogtoContext } from "@logto/node";
import { ensureAuthenticated } from "@/auth/functions.server";
import { deleteLogtoUser } from "@/auth/logto-management.server";
import {
  withAdminMutation,
  DELETION_PENDING_MESSAGE,
  FINAL_ADMIN_MESSAGE,
} from "./admin-mutation.server";
import { reserveUserDeletion } from "./user-deletion-reservation.server";
import { destroyLogtoSession } from "@/auth/logto.server";
import { prisma } from "@/prisma.server";
import { ensureSameOriginRequest } from "@/security/same-origin.server";
import {
  planAccountDeletionFromLinks,
  type AccountDeletionPreview,
} from "./account-deletion-plan";
import { deleteBookScopedRedisDataForAccountBooks } from "./account-deletion-redis";

function getAuthenticatedExternalId(context: LogtoContext): string {
  if (!context.claims?.sub) {
    throw new Error("No authenticated user subject.");
  }

  return context.claims.sub;
}

function getAuthenticatedDisplayName(context: LogtoContext): string {
  const claims =
    typeof context.claims === "object" && context.claims !== null
      ? (context.claims as Record<string, unknown>)
      : {};

  const displayName = claims.name ?? claims.username ?? claims.email;
  return typeof displayName === "string" && displayName.trim().length > 0
    ? displayName.trim()
    : "your account";
}

async function getUserAccountBookLinks(externalId: string) {
  return prisma.user.findUnique({
    where: { externalId },
    select: {
      id: true,
      accountBookLinks: {
        select: {
          accountBook: {
            select: {
              id: true,
              name: true,
              _count: {
                select: {
                  userLinks: true,
                },
              },
            },
          },
        },
        orderBy: {
          accountBook: {
            name: "asc",
          },
        },
      },
    },
  });
}

export async function getAccountDeletionPreview(): Promise<AccountDeletionPreview> {
  const context = await ensureAuthenticated();
  const externalId = getAuthenticatedExternalId(context);
  const user = await getUserAccountBookLinks(externalId);
  const plan = planAccountDeletionFromLinks(user?.accountBookLinks ?? []);

  return {
    displayName: getAuthenticatedDisplayName(context),
    ...plan,
  };
}

export async function deleteApplicationUserData(args: {
  externalId: string;
  accountBookIdsToDelete: string[];
}): Promise<void> {
  await withAdminMutation(async (tx) => {
    const user = await tx.user.findUnique({
      where: { externalId: args.externalId },
    });
    if (user && !user.deletionPending)
      throw new Error(DELETION_PENDING_MESSAGE);
    await tx.user.deleteMany({
      where: { externalId: args.externalId },
    });

    if (args.accountBookIdsToDelete.length === 0) {
      return;
    }

    await tx.accountBook.deleteMany({
      where: {
        id: {
          in: args.accountBookIdsToDelete,
        },
        userLinks: {
          none: {},
        },
      },
    });
  });
}

export async function deleteUserAccountData(args: {
  externalId: string;
  currentAdminId?: string;
}): Promise<void> {
  const links = await reserveUserDeletion(args);
  const plan = planAccountDeletionFromLinks(links);
  const accountBookIdsToDelete = plan.accountBooksToDelete.map(
    (book) => book.id,
  );
  // Never retry external effects as part of a rolled-back database transaction.
  await deleteLogtoUser(args.externalId);
  await deleteBookScopedRedisDataForAccountBooks(accountBookIdsToDelete);
  await deleteApplicationUserData({
    externalId: args.externalId,
    accountBookIdsToDelete,
  });
}

export async function deleteAuthenticatedAccount(): Promise<void> {
  const context = await ensureAuthenticated();
  await deleteUserAccountData({
    externalId: getAuthenticatedExternalId(context),
  });
}

export async function handleAccountDeletionRequest(
  request: Request,
): Promise<Response> {
  ensureSameOriginRequest(request);
  try {
    await deleteAuthenticatedAccount();
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.startsWith(FINAL_ADMIN_MESSAGE)
    ) {
      return new Response(error.message, {
        status: 409,
        headers: { "content-type": "text/plain; charset=utf-8" },
      });
    }
    throw error;
  }
  await destroyLogtoSession();

  return new Response(null, {
    status: 302,
    headers: {
      Location: "/account/delete?deleted=1",
    },
  });
}
