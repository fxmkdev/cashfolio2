import type { LogtoContext } from "@logto/node";
import { Prisma } from "../.prisma-client/client";
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
  planUserDeletionFromLinks,
  type UserDeletionPreview,
} from "./user-deletion-plan";
import { deleteBookScopedRedisDataForAccountBooks } from "./user-deletion-redis";

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
    : "your Cashfolio account";
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

export async function getUserDeletionPreview(): Promise<UserDeletionPreview> {
  const context = await ensureAuthenticated({ allowDeletionPending: true });
  const externalId = getAuthenticatedExternalId(context);
  const user = await getUserAccountBookLinks(externalId);
  const plan = planUserDeletionFromLinks(user?.accountBookLinks ?? []);

  return {
    displayName: getAuthenticatedDisplayName(context),
    ...plan,
  };
}

export async function deleteApplicationUserData(args: {
  externalId: string;
}): Promise<string[]> {
  return withAdminMutation(async (tx) => {
    // Block new membership links before reading the user's current books.
    await tx.$queryRaw`SELECT id FROM "User" WHERE "externalId" = ${args.externalId} FOR UPDATE`;
    const user = await tx.user.findUnique({
      where: { externalId: args.externalId },
      select: {
        deletionPending: true,
        accountBookLinks: { select: { accountBookId: true } },
      },
    });
    if (!user) return [];
    if (!user.deletionPending) throw new Error(DELETION_PENDING_MESSAGE);

    const candidateIds = user.accountBookLinks
      .map((link) => link.accountBookId)
      .sort();
    if (candidateIds.length > 0) {
      // Prevent new links while deciding which books have become orphaned.
      await tx.$queryRaw(Prisma.sql`
        SELECT id FROM "AccountBook"
        WHERE id IN (${Prisma.join(candidateIds)}) ORDER BY id FOR UPDATE
      `);
    }
    await tx.user.deleteMany({
      where: { externalId: args.externalId },
    });

    if (candidateIds.length === 0) return [];
    const orphanedBooks = await tx.accountBook.findMany({
      where: {
        id: { in: candidateIds },
        userLinks: { none: {} },
      },
      select: { id: true },
      orderBy: { id: "asc" },
    });
    const deletedBookIds = orphanedBooks.map((book) => book.id);
    if (deletedBookIds.length > 0) {
      await tx.accountBook.deleteMany({
        where: { id: { in: deletedBookIds }, userLinks: { none: {} } },
      });
    }
    return deletedBookIds;
  });
}

export async function deleteUserData(args: {
  externalId: string;
  currentAdminId?: string;
}): Promise<void> {
  await reserveUserDeletion(args);
  // Never retry external effects as part of a rolled-back database transaction.
  await deleteLogtoUser(args.externalId);
  const deletedBookIds = await deleteApplicationUserData({
    externalId: args.externalId,
  });
  await deleteBookScopedRedisDataForAccountBooks(deletedBookIds);
}

export async function deleteAuthenticatedUser(): Promise<void> {
  const context = await ensureAuthenticated({ allowDeletionPending: true });
  await deleteUserData({
    externalId: getAuthenticatedExternalId(context),
  });
}

export async function handleUserDeletionRequest(
  request: Request,
): Promise<Response> {
  ensureSameOriginRequest(request);
  try {
    await deleteAuthenticatedUser();
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
      Location: "/user/delete?deleted=1",
    },
  });
}
