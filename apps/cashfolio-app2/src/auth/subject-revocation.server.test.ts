import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Prisma } from "../.prisma-client/client";
import {
  hashAuthSubject,
  lockAuthSubject,
  provisionCallbackUser,
  revokeAuthSubject,
} from "./subject-revocation.server";

const calls = {
  $queryRaw: vi.fn(),
  authSubjectRevocation: { findUnique: vi.fn(), createMany: vi.fn() },
  user: { createMany: vi.fn(), findUniqueOrThrow: vi.fn() },
};
const tx = calls as unknown as Prisma.TransactionClient;

beforeEach(() => {
  vi.resetAllMocks();
  calls.authSubjectRevocation.findUnique.mockResolvedValue(null);
  calls.user.findUniqueOrThrow.mockResolvedValue({
    id: "user-1",
    deletionPending: false,
  });
});

describe("subject revocation and callback provisioning", () => {
  it("keeps a stable hash and shares the lock even when no User exists", async () => {
    const hash = await lockAuthSubject(tx, "subject-1");
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    expect(hash).toBe(hashAuthSubject("subject-1"));
    expect(hash).not.toBe(hashAuthSubject("subject-2"));
    await revokeAuthSubject(tx, hash);
    expect(calls.authSubjectRevocation.createMany).toHaveBeenCalledWith({
      data: [{ subjectHash: hash }],
      skipDuplicates: true,
    });
  });
  it("rejects a revoked identity before provisioning a new User", async () => {
    calls.authSubjectRevocation.findUnique.mockResolvedValue({
      revokedAt: new Date(),
    });
    expect(await provisionCallbackUser(tx, "deleted")).toBeNull();
    expect(calls.user.createMany).not.toHaveBeenCalled();
    expect(calls.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
      calls.authSubjectRevocation.findUnique.mock.invocationCallOrder[0],
    );
  });
  it("uses a conflict-safe insert and returns an existing active User", async () => {
    expect(await provisionCallbackUser(tx, "subject-1")).toEqual({
      id: "user-1",
      deletionPending: false,
    });
    expect(calls.user.createMany).toHaveBeenCalledWith({
      data: [{ id: expect.any(String), externalId: "subject-1" }],
      skipDuplicates: true,
    });
  });
  it("also rejects an existing deletion-pending user", async () => {
    calls.user.findUniqueOrThrow.mockResolvedValue({ deletionPending: true });
    expect(await provisionCallbackUser(tx, "subject-1")).toBeNull();
  });
});
