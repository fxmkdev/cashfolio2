import { setTimeout as delay } from "node:timers/promises";
import { beforeEach, expect, it, vi } from "vitest";
import { Prisma } from "../.prisma-client/client";
import { withDatabaseConflictRetry } from "./database-conflict-retry";

vi.mock("node:timers/promises", () => ({
  setTimeout: vi.fn().mockResolvedValue(undefined),
}));

beforeEach(() => vi.clearAllMocks());

function prismaError(code: string, meta?: Record<string, unknown>) {
  return new Prisma.PrismaClientKnownRequestError("database failure", {
    code,
    meta,
    clientVersion: "test",
  });
}

it("returns successful results without retrying", async () => {
  const result = { id: "created" };
  const operation = vi.fn().mockResolvedValue(result);
  expect(await withDatabaseConflictRetry(operation)).toBe(result);
  expect(operation).toHaveBeenCalledOnce();
  expect(delay).not.toHaveBeenCalled();
});

it.each([
  prismaError("P2034"),
  prismaError("P2010", { code: "40P01" }),
  prismaError("P2010", {
    driverAdapterError: { cause: { originalCode: "40P01" } },
  }),
])("recreates rolled-back operations after a conflict: %j", async (error) => {
  const operation = vi
    .fn()
    .mockRejectedValueOnce(error)
    .mockRejectedValueOnce(error)
    .mockResolvedValue("committed");
  await expect(withDatabaseConflictRetry(operation)).resolves.toBe("committed");
  expect(operation).toHaveBeenCalledTimes(3);
  expect(vi.mocked(delay).mock.calls).toEqual([[100], [200]]);
});

it("stops after three attempts and preserves the final error", async () => {
  const lastError = prismaError("P2034");
  const operation = vi
    .fn()
    .mockRejectedValueOnce(prismaError("P2034"))
    .mockRejectedValueOnce(prismaError("P2010", { code: "40P01" }))
    .mockRejectedValueOnce(lastError);
  await expect(withDatabaseConflictRetry(operation)).rejects.toBe(lastError);
  expect(operation).toHaveBeenCalledTimes(3);
  expect(vi.mocked(delay).mock.calls).toEqual([[100], [200]]);
});

it.each([
  new Error("validation failed"),
  new Error("authorization denied"),
  prismaError("P2002"),
  prismaError("P2003"),
  prismaError("P2028"),
  prismaError("P1001"),
  prismaError("P1017"),
  prismaError("P2010"),
  prismaError("P2010", { code: "42501" }),
  prismaError("P2010", { code: "55P03" }),
  prismaError("P2010", {
    driverAdapterError: { cause: { originalCode: "55P03" } },
  }),
  new TypeError("Failed to fetch"),
  prismaError("P2010", {
    driverAdapterError: { cause: { originalCode: "42501" } },
  }),
  { code: "P2034" },
])("immediately propagates non-conflict errors: %j", async (error) => {
  const operation = vi.fn().mockRejectedValue(error);
  await expect(withDatabaseConflictRetry(operation)).rejects.toBe(error);
  expect(operation).toHaveBeenCalledOnce();
  expect(delay).not.toHaveBeenCalled();
});

it("does not retry a later validation failure after a rolled-back conflict", async () => {
  const validationError = new Error("state no longer allows this mutation");
  const operation = vi
    .fn()
    .mockRejectedValueOnce(prismaError("P2034"))
    .mockRejectedValueOnce(validationError);
  await expect(withDatabaseConflictRetry(operation)).rejects.toBe(
    validationError,
  );
  expect(operation).toHaveBeenCalledTimes(2);
  expect(vi.mocked(delay).mock.calls).toEqual([[100]]);
});
