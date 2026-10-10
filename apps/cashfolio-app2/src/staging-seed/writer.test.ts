import { expect, it, vi } from "vitest";
import type { PrismaClient } from "../.prisma-client/client";
import { generateStagingDataset } from "./dataset";
import { replaceStagingData } from "./writer";

it("refuses replacement without a tester before starting a database transaction", async () => {
  const transaction = vi.fn();
  const client = { $transaction: transaction } as unknown as PrismaClient;
  const target = {
    hostname: "ep-staging.eu-central-1.aws.neon.tech",
    projectId: "test-project",
    branchId: "br-staging",
    endpointId: "ep-staging",
    database: "neondb",
    role: "cashfolio_staging_seed",
  };
  const dataset = generateStagingDataset(new Date("2026-10-10T00:00:00Z"));
  for (const testerExternalIds of [[], [" "]]) {
    await expect(
      replaceStagingData(client, { target, testerExternalIds }, dataset),
    ).rejects.toThrow("configured tester");
  }
  expect(transaction).not.toHaveBeenCalled();
});
