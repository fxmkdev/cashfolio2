import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  hashSessionToken,
  newSessionToken,
  sessionDeadlines,
} from "./session-policy";

const mocks = vi.hoisted(() => {
  const tx = {
    $executeRaw: vi.fn(),
    $queryRaw: vi.fn(),
    authSession: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      updateMany: vi.fn(),
      deleteMany: vi.fn(),
    },
  };
  return { tx, transaction: vi.fn() };
});
vi.mock("../prisma.server", () => ({
  prisma: { $transaction: mocks.transaction },
}));

import {
  createSession,
  readSessionData,
  revokeSession,
  saveSession,
  withSessionLock,
  type SessionTransaction,
  type StoredSession,
} from "./session-store.server";

const tx = mocks.tx as unknown as SessionTransaction;
function storedSession(): StoredSession {
  return {
    id: "session-1",
    tokenHash: "hash",
    encryptedData: "cipher",
    createdAt: new Date(),
    ...sessionDeadlines(new Date(), true),
    userId: "user-1",
    user: {
      id: "user-1",
      externalId: "external-1",
      roles: [],
      deletionPending: false,
      locale: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("SESSION_SECRET", "test-encryption-key");
  mocks.transaction.mockImplementation(async (operation) =>
    operation(mocks.tx),
  );
  mocks.tx.authSession.findMany.mockResolvedValue([]);
  mocks.tx.authSession.create.mockImplementation(async ({ data }) => data);
  mocks.tx.authSession.updateMany.mockResolvedValue({ count: 1 });
});
afterEach(() => vi.unstubAllEnvs());

describe("PostgreSQL session storage", () => {
  it("stores a bearer hash and encrypted credentials and bounds expiry cleanup", async () => {
    mocks.tx.authSession.findMany.mockResolvedValue([{ id: "expired" }]);
    const created = await createSession(
      tx,
      { refreshToken: "private-token" },
      "user-1",
    );
    const data = mocks.tx.authSession.create.mock.calls[0][0].data;
    expect(data.tokenHash).toBe(hashSessionToken(created.token));
    expect(data.encryptedData).not.toContain("private-token");
    expect(await readSessionData({ ...storedSession(), ...data })).toEqual({
      refreshToken: "private-token",
    });
    expect(mocks.tx.authSession.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 100 }),
    );
    expect(mocks.tx.authSession.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ["expired"] } },
    });
  });
  it("uses the pending login deadline and requires an encryption key", async () => {
    const created = await createSession(tx, {}, null);
    expect(created.expiresAt.getTime() - Date.now()).toBeLessThanOrEqual(
      600_000,
    );
    vi.stubEnv("SESSION_SECRET", "");
    await expect(createSession(tx, {}, null)).rejects.toThrow(
      "SESSION_SECRET must be set",
    );
  });
  it("locks before reading an existing session", async () => {
    const session = storedSession();
    mocks.tx.authSession.findUnique.mockResolvedValue(session);
    const token = newSessionToken();
    expect(await withSessionLock(token, async (_tx, current) => current)).toBe(
      session,
    );
    expect(mocks.tx.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.tx.authSession.findUnique.mock.invocationCallOrder[0],
    );
    expect(mocks.tx.authSession.findUnique).toHaveBeenCalledWith({
      where: { tokenHash: hashSessionToken(token) },
      include: { user: true },
    });
  });
  it.each(["expiresAt", "idleExpiresAt"] as const)(
    "deletes a session at its %s boundary",
    async (field) => {
      const session = { ...storedSession(), [field]: new Date(0) };
      mocks.tx.authSession.findUnique.mockResolvedValue(session);
      expect(
        await withSessionLock(
          newSessionToken(),
          async (_tx, current) => current,
        ),
      ).toBeNull();
      expect(mocks.tx.authSession.deleteMany).toHaveBeenCalledWith({
        where: { id: session.id },
      });
    },
  );
  it("does not query a caller-supplied malformed bearer", async () => {
    await withSessionLock("invalid", async (_tx, current) =>
      expect(current).toBeNull(),
    );
    expect(mocks.tx.authSession.findUnique).not.toHaveBeenCalled();
  });
  it("conditionally saves only an unexpired, existing, permitted session", async () => {
    const session = storedSession();
    expect(await saveSession(tx, session, { idToken: "token" })).toBe(true);
    expect(mocks.tx.authSession.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: session.id,
          expiresAt: { gt: expect.any(Date) },
          idleExpiresAt: { gt: expect.any(Date) },
          user: { is: { deletionPending: false } },
        },
      }),
    );
    mocks.tx.authSession.updateMany.mockResolvedValue({ count: 0 });
    expect(await saveSession(tx, session, {}, true)).toBe(false);
    expect(mocks.tx.authSession.create).not.toHaveBeenCalled();
    await revokeSession(tx, null);
    expect(mocks.tx.authSession.deleteMany).not.toHaveBeenCalled();
    await revokeSession(tx, session);
    expect(mocks.tx.authSession.deleteMany).toHaveBeenCalledWith({
      where: { id: session.id },
    });
  });
  it("persists refresh recovery without touching either deadline", async () => {
    const session = storedSession();
    await saveSession(
      tx,
      session,
      { idToken: "previous-verified", refreshToken: "replacement" },
      false,
      false,
    );
    const { data } = mocks.tx.authSession.updateMany.mock.calls[0][0];
    expect(data).not.toHaveProperty("idleExpiresAt");
    expect(data).not.toHaveProperty("expiresAt");
    expect(
      await readSessionData({ ...session, encryptedData: data.encryptedData }),
    ).toEqual({ idToken: "previous-verified", refreshToken: "replacement" });
  });
});
