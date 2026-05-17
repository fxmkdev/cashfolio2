import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./.prisma-client/client";

let prisma: PrismaClient;

declare global {
  var __db__: PrismaClient;
}

// this is needed because in development we don't want to restart
// the server with every change, but we want to make sure we don't
// create a new connection to the DB with every change either.
// in production we'll have a single connection to the DB.
if (process.env.NODE_ENV === "production") {
  prisma = await getConnectedClient();
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

  const connectionString = withConnectTimeout(DATABASE_URL);
  console.log(
    `🔌 setting up prisma client to ${getDatabaseHostForLog(connectionString)}`,
  );

  const adapter = new PrismaPg({ connectionString });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client = new (PrismaClient as any)({ adapter }) as PrismaClient;

  return client;
}

async function getConnectedClient() {
  const client = getClient();
  try {
    await client.$connect();
    return client;
  } catch (error) {
    console.error(
      "Prisma startup DB connection failed.",
      getErrorLogPayload(error),
    );
    throw new Error(
      "Prisma failed to connect to the database during startup. See server logs for details.",
      {
        cause: error,
      },
    );
  }
}

function withConnectTimeout(databaseUrlRaw: string) {
  try {
    const databaseUrl = new URL(databaseUrlRaw);
    if (!databaseUrl.searchParams.has("connect_timeout")) {
      databaseUrl.searchParams.set("connect_timeout", "20");
    }
    return databaseUrl.toString();
  } catch (error) {
    console.warn(
      "Unable to parse DATABASE_URL for connect_timeout normalization; using raw DATABASE_URL.",
      getErrorLogPayload(error),
    );
    return databaseUrlRaw;
  }
}

function getDatabaseHostForLog(connectionString: string) {
  try {
    return new URL(connectionString).host || "<unknown-host>";
  } catch {
    return "<unparseable-database-url>";
  }
}

function getErrorLogPayload(error: unknown) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
      ...(hasErrorCode(error) ? { code: error.code } : {}),
    };
  }

  if (error instanceof Response) {
    return {
      type: "Response",
      status: error.status,
      statusText: error.statusText,
      url: error.url,
    };
  }

  return { value: String(error) };
}

function hasErrorCode(error: Error): error is Error & {
  code: string;
} {
  return (
    "code" in error && typeof (error as { code?: unknown }).code === "string"
  );
}

export { prisma };
