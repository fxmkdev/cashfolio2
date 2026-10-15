import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "../.prisma-client/client";
import { UserRole } from "../.prisma-client/enums";

const tx = vi.hoisted(() => ({
  $executeRaw: vi.fn(),
  $queryRaw: vi.fn(),
  user: { findUnique: vi.fn(), count: vi.fn() },
}));
const transaction = vi.hoisted(() => vi.fn());
vi.mock("../prisma.server", () => ({ prisma: { $transaction: transaction } }));
vi.mock("node:timers/promises", () => ({ setTimeout: vi.fn() }));
import {
  requireActiveAdmin,
  requireAnotherActiveAdmin,
  withAdminMutation,
} from "./admin-mutation.server";

describe("Admin mutation boundary", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    transaction.mockImplementation(async (operation) => operation(tx));
  });
  it("acquires the global transaction lock before reading business state", async () => {
    const operation = vi.fn(async () => "done");
    await expect(withAdminMutation(operation)).resolves.toBe("done");
    expect(tx.$executeRaw.mock.invocationCallOrder[0]).toBeLessThan(
      tx.$queryRaw.mock.invocationCallOrder[0],
    );
    expect(tx.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
      operation.mock.invocationCallOrder[0],
    );
    expect(transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: "ReadCommitted",
      timeout: 30_000,
    });
  });
  it("retries only the rolled-back database transaction", async () => {
    transaction.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError("conflict", {
        code: "P2034",
        clientVersion: "test",
      }),
    );
    await withAdminMutation(async () => "done");
    expect(transaction).toHaveBeenCalledTimes(2);
  });
  it("does not run the operation when acquiring the lock fails", async () => {
    const error = new Error("lock unavailable");
    tx.$queryRaw.mockRejectedValueOnce(error);
    const operation = vi.fn();
    await expect(withAdminMutation(operation)).rejects.toBe(error);
    expect(operation).not.toHaveBeenCalled();
  });
  it.each([
    null,
    { roles: [] },
    { roles: [UserRole.ADMIN], deletionPending: true },
  ])("rejects an inactive or missing actor", async (actor) => {
    tx.user.findUnique.mockResolvedValue(actor);
    await expect(
      requireActiveAdmin(tx as unknown as Prisma.TransactionClient, "actor"),
    ).rejects.toMatchObject({ status: 403 });
  });
  it("accepts an active actor and counts only other non-pending admins", async () => {
    const actor = {
      id: "actor",
      roles: [UserRole.ADMIN],
      deletionPending: false,
    };
    tx.user.findUnique.mockResolvedValue(actor);
    await expect(
      requireActiveAdmin(tx as unknown as Prisma.TransactionClient, actor.id),
    ).resolves.toBe(actor);
    tx.user.count.mockResolvedValue(1);
    await requireAnotherActiveAdmin(
      tx as unknown as Prisma.TransactionClient,
      "target",
    );
    expect(tx.user.count).toHaveBeenCalledWith({
      where: {
        id: { not: "target" },
        roles: { has: "ADMIN" },
        deletionPending: false,
      },
    });
    tx.user.count.mockResolvedValue(0);
    await expect(
      requireAnotherActiveAdmin(
        tx as unknown as Prisma.TransactionClient,
        "target",
      ),
    ).rejects.toThrow("At least one Admin user is required.");
  });
});
