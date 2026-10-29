import { createId } from "@paralleldrive/cuid2";
import { unwrapSession, wrapSession, type SessionData } from "@logto/node";
import { Prisma } from "../.prisma-client/client";
import { prisma } from "../prisma.server";
import {
  hashSessionToken,
  isSessionCurrent,
  newSessionToken,
  nextIdleDeadline,
  sessionDeadlines,
} from "./session-policy";

export type SessionTransaction = Prisma.TransactionClient;
export type StoredSession = Prisma.AuthSessionGetPayload<{
  include: { user: true };
}>;

function encryptionKey() {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET must be set");
  return secret;
}

/** Never retry a transaction that may already have refreshed an OIDC token. */
export async function withSessionLock<T>(
  token: string | undefined,
  operation: (
    tx: SessionTransaction,
    session: StoredSession | null,
  ) => Promise<T>,
): Promise<T> {
  const tokenHash = hashSessionToken(token);
  return prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SET LOCAL lock_timeout = '10s'`;
      if (tokenHash) {
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${tokenHash}, 812719))::text`;
      }
      const session = tokenHash
        ? await tx.authSession.findUnique({
            where: { tokenHash },
            include: { user: true },
          })
        : null;
      if (session && !isSessionCurrent(session)) {
        await tx.authSession.deleteMany({ where: { id: session.id } });
        return operation(tx, null);
      }
      return operation(tx, session);
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
      timeout: 30_000,
    },
  );
}

export async function readSessionData(session: StoredSession) {
  return unwrapSession(session.encryptedData, encryptionKey());
}

export async function createSession(
  tx: SessionTransaction,
  data: SessionData,
  userId: string | null,
) {
  const now = new Date();
  const expired = await tx.authSession.findMany({
    where: {
      OR: [{ expiresAt: { lte: now } }, { idleExpiresAt: { lte: now } }],
    },
    select: { id: true },
    take: 100,
  });
  await tx.authSession.deleteMany({
    where: { id: { in: expired.map((s) => s.id) } },
  });
  const token = newSessionToken();
  const session = await tx.authSession.create({
    data: {
      id: createId(),
      tokenHash: hashSessionToken(token)!,
      encryptedData: await wrapSession(data, encryptionKey()),
      userId,
      ...sessionDeadlines(now, userId !== null),
    },
  });
  return { token, expiresAt: session.expiresAt };
}

export async function saveSession(
  tx: SessionTransaction,
  session: StoredSession,
  data: SessionData,
  allowDeletionPending = false,
  renewIdle = true,
) {
  const now = new Date();
  const result = await tx.authSession.updateMany({
    where: {
      id: session.id,
      expiresAt: { gt: now },
      idleExpiresAt: { gt: now },
      user: {
        is: { deletionPending: allowDeletionPending ? undefined : false },
      },
    },
    data: {
      encryptedData: await wrapSession(data, encryptionKey()),
      ...(renewIdle
        ? { idleExpiresAt: nextIdleDeadline(session.expiresAt, now) }
        : {}),
    },
  });
  return result.count === 1;
}

export async function revokeSession(
  tx: SessionTransaction,
  session: StoredSession | null,
) {
  if (session) await tx.authSession.deleteMany({ where: { id: session.id } });
}
