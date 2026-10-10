import { setTimeout as delay } from "node:timers/promises";
import { beforeEach, expect, it, vi } from "vitest";
import { Prisma, type PrismaClient } from "../.prisma-client/client";
import { generateStagingDataset } from "./dataset";
import { replaceStagingData } from "./writer";
import { SeedSafetyError } from "./target";

vi.mock("node:timers/promises", () => ({
  setTimeout: vi.fn().mockResolvedValue(undefined),
}));

beforeEach(() => vi.clearAllMocks());

const target = {
  hostname: "ep-staging.eu-central-1.aws.neon.tech",
  projectId: "test-project",
  branchId: "br-staging",
  endpointId: "ep-staging",
  database: "neondb",
  role: "cashfolio_staging_seed",
};
const config = { target, testerExternalIds: ["tester"] };
const dataset = generateStagingDataset(new Date("2026-10-10T00:00:00Z"));
const summary = {
  from: "2023-10-10",
  through: "2026-10-10",
  testers: 1,
  books: [],
};

function prismaError(code: string, meta?: Record<string, unknown>) {
  return new Prisma.PrismaClientKnownRequestError("transaction failure", {
    code,
    meta,
    clientVersion: "test",
  });
}

it("refuses replacement without a tester before starting a database transaction", async () => {
  const transaction = vi.fn();
  const client = { $transaction: transaction } as unknown as PrismaClient;
  for (const testerExternalIds of [[], [" "]]) {
    await expect(
      replaceStagingData(client, { target, testerExternalIds }, dataset),
    ).rejects.toThrow("configured tester");
  }
  expect(transaction).not.toHaveBeenCalled();
  expect(delay).not.toHaveBeenCalled();
});

it.each([
  prismaError("P2010", { code: "40P01" }),
  prismaError("P2010", {
    driverAdapterError: {
      cause: { originalCode: "40P01", kind: "TransactionWriteConflict" },
    },
  }),
  prismaError("P2034"),
])(
  "retries the entire replacement transaction after a transient conflict: %j",
  async (error) => {
    const transaction = vi
      .fn()
      .mockRejectedValueOnce(error)
      .mockResolvedValue(summary);
    const client = { $transaction: transaction } as unknown as PrismaClient;

    await expect(replaceStagingData(client, config, dataset)).resolves.toEqual(
      summary,
    );
    expect(transaction).toHaveBeenCalledTimes(2);
    expect(
      transaction.mock.calls.every(
        ([, options]) => options.timeout === 120_000,
      ),
    ).toBe(true);
    expect(delay).toHaveBeenCalledExactlyOnceWith(100);
  },
);

it("stops after three failed transaction attempts and preserves the final error", async () => {
  const error = prismaError("P2010", { code: "40P01" });
  const transaction = vi.fn().mockRejectedValue(error);
  const client = { $transaction: transaction } as unknown as PrismaClient;

  await expect(replaceStagingData(client, config, dataset)).rejects.toBe(error);
  expect(transaction).toHaveBeenCalledTimes(3);
  expect(vi.mocked(delay).mock.calls).toEqual([[100], [200]]);
});

it.each([
  new SeedSafetyError(
    "The connected database is not the approved staging target",
  ),
  new SeedSafetyError(
    "Configured testers must include an existing staging administrator",
  ),
  new Error("injected booking failure"),
  prismaError("P2002"),
  prismaError("P2010"),
  prismaError("P2010", { code: "42501" }),
  prismaError("P2010", {
    driverAdapterError: { cause: { originalCode: "42501" } },
  }),
])("does not retry safety or non-transient failures: %j", async (error) => {
  const transaction = vi.fn().mockRejectedValue(error);
  const client = { $transaction: transaction } as unknown as PrismaClient;

  await expect(replaceStagingData(client, config, dataset)).rejects.toBe(error);
  expect(transaction).toHaveBeenCalledTimes(1);
  expect(delay).not.toHaveBeenCalled();
});
