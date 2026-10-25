import { assertSafeWriteTarget, prisma } from "./db-client";

export async function withBookLock<T>(
  accountBookId: string,
  action: () => Promise<T>,
): Promise<T> {
  assertSafeWriteTarget();
  let notifyLocked!: () => void;
  const locked = new Promise<void>((resolve) => {
    notifyLocked = resolve;
  });
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const holder = prisma.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT id FROM "AccountBook" WHERE id = ${accountBookId} FOR UPDATE`;
      notifyLocked();
      await gate;
    },
    { timeout: 60_000 },
  );

  try {
    await Promise.race([locked, holder]);
    return await action();
  } finally {
    release();
    await holder;
  }
}
