import { createHash } from "node:crypto";
import { createId } from "@paralleldrive/cuid2";
import type { Prisma } from "../.prisma-client/client";

export function hashAuthSubject(externalId: string) {
  return createHash("sha256").update(externalId).digest("hex");
}

/** Shared by callback provisioning and deletion, including when no User exists. */
export async function lockAuthSubject(
  tx: Prisma.TransactionClient,
  externalId: string,
) {
  const subjectHash = hashAuthSubject(externalId);
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${subjectHash}, 812720))::text`;
  return subjectHash;
}

export async function revokeAuthSubject(
  tx: Prisma.TransactionClient,
  subjectHash: string,
) {
  await tx.authSubjectRevocation.createMany({
    data: [{ subjectHash }],
    skipDuplicates: true,
  });
}

export async function provisionCallbackUser(
  tx: Prisma.TransactionClient,
  externalId: string,
) {
  const subjectHash = await lockAuthSubject(tx, externalId);
  if (await tx.authSubjectRevocation.findUnique({ where: { subjectHash } })) {
    return null;
  }
  // createMany(skipDuplicates) uses INSERT ... ON CONFLICT DO NOTHING. An
  // empty-update upsert can instead race on INSERT and abort this transaction.
  await tx.user.createMany({
    data: [{ id: createId(), externalId }],
    skipDuplicates: true,
  });
  const user = await tx.user.findUniqueOrThrow({ where: { externalId } });
  return user.deletionPending ? null : user;
}
