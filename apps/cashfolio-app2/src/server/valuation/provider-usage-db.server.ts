import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, type Prisma } from "../../.prisma-client/client";

declare global {
  var __providerUsageDb__: PrismaClient | undefined;
}
let client: PrismaClient | undefined;

export function createProviderUsageClient(databaseUrl: string): PrismaClient {
  const url = new URL(databaseUrl);
  // A URL query timeout must not override this best-effort client's deadline.
  url.searchParams.delete("query_timeout");
  return new PrismaClient({
    adapter: new PrismaPg({
      connectionString: url.href,
      max: 1,
      connectionTimeoutMillis: 250,
      query_timeout: 750,
    }),
  });
}

export function getProviderUsageClient(): PrismaClient {
  if (process.env.NODE_ENV !== "production" && global.__providerUsageDb__)
    return global.__providerUsageDb__;
  if (!client) {
    if (!process.env.DATABASE_URL)
      throw new Error("Missing database configuration");
    client = createProviderUsageClient(process.env.DATABASE_URL);
    if (process.env.NODE_ENV !== "production")
      global.__providerUsageDb__ = client;
  }
  return client;
}

export async function writeProviderUsage(
  data: Prisma.ValuationProviderRequestCreateInput,
): Promise<void> {
  await getProviderUsageClient().$transaction(
    async (tx) => {
      // Transaction-local settings also work with transaction-pooling database proxies.
      await tx.$queryRaw`SELECT set_config('statement_timeout', '500', true)`;
      await tx.$queryRaw`SELECT set_config('lock_timeout', '250', true)`;
      await tx.valuationProviderRequest.create({ data });
    },
    { maxWait: 250, timeout: 750 },
  );
}
