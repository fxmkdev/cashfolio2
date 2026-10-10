import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../.prisma-client/client";
import { CLEANUP_LOG_PREFIX, cleanupProviderUsage } from "./run";
import { createCleanupStore } from "./store";

let client: PrismaClient | undefined;
try {
  if (!process.env.DATABASE_URL)
    throw new Error("Missing database configuration.");
  client = new PrismaClient({
    adapter: new PrismaPg({
      connectionString: process.env.DATABASE_URL,
      max: 1,
      connectionTimeoutMillis: 20_000,
    }),
  });
  await cleanupProviderUsage(createCleanupStore(client), {
    report: (summary) =>
      console.log(CLEANUP_LOG_PREFIX + JSON.stringify(summary)),
  });
} catch {
  // Database/driver errors may contain credentials; report only progress and a fixed message.
  console.error(
    "Provider usage cleanup failed; inspect the cleanup progress logs.",
  );
  process.exitCode = 1;
} finally {
  try {
    await client?.$disconnect();
  } catch {
    console.error(
      "Provider usage cleanup failed to disconnect its database client.",
    );
    process.exitCode = 1;
  }
}
