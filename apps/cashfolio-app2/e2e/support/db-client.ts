import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../src/.prisma-client/client";

export const databaseUrl =
  process.env.DATABASE_URL ??
  "postgresql://postgres:postgres@127.0.0.1:5433/postgres?schema=public";

const adapter = new PrismaPg({ connectionString: databaseUrl });
export const prisma = new PrismaClient({ adapter });

export const DEFAULT_EXTERNAL_ID =
  process.env.E2E_AUTH_EXTERNAL_ID ?? "e2e-user";

export function assertSafeWriteTarget() {
  if (process.env.E2E_TEST_MODE !== "true") {
    throw new Error(
      "Refusing e2e DB writes because E2E_TEST_MODE is not set to true.",
    );
  }

  const parsedUrl = new URL(databaseUrl);
  const allowedHosts = new Set(["127.0.0.1", "localhost", "postgres"]);
  const allowedDatabaseNames = new Set(["postgres", "cashfolio"]);
  const databaseName = parsedUrl.pathname.replace(/^\//, "");
  const isAllowedDatabase =
    allowedDatabaseNames.has(databaseName) ||
    /(?:^|[_-])(test|e2e)(?:$|[_-])/i.test(databaseName);

  if (!allowedHosts.has(parsedUrl.hostname) || !isAllowedDatabase) {
    throw new Error(
      `Refusing e2e DB writes for DATABASE_URL host=${parsedUrl.hostname} db=${databaseName}.`,
    );
  }
}

assertSafeWriteTarget();

export async function resetDatabase(): Promise<void> {
  assertSafeWriteTarget();

  await prisma.$executeRaw`
    TRUNCATE TABLE
      "Booking",
      "Transaction",
      "Account",
      "AccountGroup",
      "UserAccountBookLink",
      "AccountBook",
      "User"
    RESTART IDENTITY CASCADE
  `;
}

export async function disconnectDb(): Promise<void> {
  await prisma.$disconnect();
}
