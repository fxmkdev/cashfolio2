import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./.prisma-client/client";

let prisma: PrismaClient;

declare global {
  // eslint-disable-next-line no-var
  var __db__: PrismaClient;
}

// this is needed because in development we don't want to restart
// the server with every change, but we want to make sure we don't
// create a new connection to the DB with every change either.
// in production we'll have a single connection to the DB.
if (process.env.NODE_ENV === "production") {
  prisma = getClient();
} else {
  if (!global.__db__) {
    global.__db__ = getClient();
  }
  prisma = global.__db__;
}

function getClient() {
  const { DATABASE_URL } = process.env;
  if (!DATABASE_URL) {
    throw new Error("DATABASE_URL env var not set");
  }

  const databaseUrl = new URL(DATABASE_URL);
  if (!databaseUrl.searchParams.has("connect_timeout")) {
    databaseUrl.searchParams.set("connect_timeout", "20");
  }
  console.log(`🔌 setting up prisma client to ${databaseUrl.host}`);

  const adapter = new PrismaPg({ connectionString: databaseUrl.toString() });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client = new (PrismaClient as any)({ adapter }) as PrismaClient;
  if (process.env.NODE_ENV === "production") {
    void client.$connect().catch((error) => {
      console.error("❌ prisma initial connect failed", error);
      process.exit(1);
    });
  }

  return client;
}

export { prisma };
