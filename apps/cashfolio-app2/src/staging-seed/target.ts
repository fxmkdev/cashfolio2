import type { Prisma } from "../.prisma-client/client";

export class SeedSafetyError extends Error {}

export type ApprovedSeedTarget = {
  hostname: string;
  projectId: string;
  branchId: string;
  endpointId: string;
  database: string;
  role: string;
};

export type ManualSeedInput = {
  projectId: string;
  branchId: string;
  testerExternalIds: string[];
};

export type SeedConfig = {
  target: ApprovedSeedTarget;
  testerExternalIds: string[];
  seedConnection: VerifiedConnection;
};

export type VerifiedConnection = {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  ssl: { rejectUnauthorized: true };
  options: string;
  enableChannelBinding: boolean;
  connectionTimeoutMillis: number;
  max: number;
};

export function parseManualSeedInput(raw: string): ManualSeedInput {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new SeedSafetyError("Manual seed input must be valid JSON.");
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new SeedSafetyError("Manual seed input must be an object.");
  }
  const record = value as Record<string, unknown>;
  if (
    Object.keys(record).length !== 3 ||
    typeof record.projectId !== "string" ||
    !/^[a-z0-9-]+$/.test(record.projectId) ||
    typeof record.branchId !== "string" ||
    !/^br-[a-z0-9-]+$/.test(record.branchId) ||
    !Array.isArray(record.testerExternalIds) ||
    !record.testerExternalIds.length ||
    record.testerExternalIds.some(
      (id) => typeof id !== "string" || !id.trim() || /[\r\n]/.test(id),
    )
  ) {
    throw new SeedSafetyError(
      "Manual seed input requires projectId, branchId and nonempty testerExternalIds.",
    );
  }
  return {
    projectId: record.projectId,
    branchId: record.branchId,
    testerExternalIds: [
      ...new Set((record.testerExternalIds as string[]).map((id) => id.trim())),
    ],
  };
}

export function readSeedConfig(
  raw: string,
  env: NodeJS.ProcessEnv = process.env,
): SeedConfig {
  if (env.APP_ENVIRONMENT !== "staging" && env.APP_ENVIRONMENT !== "preview") {
    throw new SeedSafetyError(
      "Seeding is permitted only in staging and preview.",
    );
  }
  if (env.PGOPTIONS?.trim()) {
    throw new SeedSafetyError("PGOPTIONS overrides are forbidden for seeding.");
  }
  const input = parseManualSeedInput(raw);
  const seedConnection = parseSeedConnection(env.DATABASE_URL ?? "");
  return {
    target: {
      hostname: seedConnection.host,
      endpointId: seedConnection.host.split(".")[0],
      database: seedConnection.database,
      role: seedConnection.user,
      projectId: input.projectId,
      branchId: input.branchId,
    },
    testerExternalIds: input.testerExternalIds,
    seedConnection,
  };
}

function parseSeedConnection(raw: string): VerifiedConnection {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new SeedSafetyError("DATABASE_URL must be a valid database URL.");
  }
  // Use the app's credentials, but connect directly for the replacement transaction.
  const hostname = url.hostname.replace(/-pooler(?=\.)/, "");
  let database: string;
  let user: string;
  let password: string;
  try {
    database = decodeURIComponent(url.pathname.slice(1));
    user = decodeURIComponent(url.username);
    password = decodeURIComponent(url.password);
  } catch {
    throw new SeedSafetyError("DATABASE_URL contains invalid encoding.");
  }
  if (
    !["postgres:", "postgresql:"].includes(url.protocol) ||
    url.hash ||
    !/^ep-[a-z0-9-]+(?:\.[a-z0-9-]+)+\.neon\.tech$/.test(hostname) ||
    (url.port && url.port !== "5432") ||
    !/^[a-zA-Z0-9_]+$/.test(database) ||
    !user ||
    !password
  ) {
    throw new SeedSafetyError("DATABASE_URL must identify a Neon database.");
  }
  validateConnectionParameters(url.searchParams);
  // Never forward a connection string or PGOPTIONS to pg. Whitespace blocks
  // pg's environment fallback even when PGOPTIONS is unset in this process.
  return {
    host: hostname,
    port: 5432,
    database,
    user,
    password,
    ssl: { rejectUnauthorized: true },
    options: " ",
    enableChannelBinding: true,
    connectionTimeoutMillis: 20_000,
    max: 1,
  };
}

function validateConnectionParameters(parameters: URLSearchParams) {
  const allowedParameters = new Set(["sslmode", "channel_binding", "schema"]);
  const seen = new Set<string>();
  for (const [key] of parameters) {
    if (!allowedParameters.has(key) || seen.has(key)) {
      throw new SeedSafetyError(
        "Unexpected or duplicate connection parameters are forbidden.",
      );
    }
    seen.add(key);
  }
  if (
    !["require", "verify-full"].includes(parameters.get("sslmode") ?? "") ||
    (parameters.has("channel_binding") &&
      parameters.get("channel_binding") !== "require") ||
    (parameters.has("schema") && parameters.get("schema") !== "public")
  ) {
    throw new SeedSafetyError(
      "The connection must require TLS and the public schema.",
    );
  }
}

export async function verifyServerIdentity(
  connection: Pick<Prisma.TransactionClient, "$queryRaw">,
  target: ApprovedSeedTarget,
): Promise<void> {
  const identities = await connection.$queryRaw<
    Array<{
      projectId: string | null;
      branchId: string | null;
      endpointId: string | null;
      database: string;
      role: string;
    }>
  >`
    SELECT current_setting('neon.project_id', true) AS "projectId",
           current_setting('neon.branch_id', true) AS "branchId",
           current_setting('neon.endpoint_id', true) AS "endpointId",
           current_database() AS "database", current_user AS "role"
  `;
  const identity = identities[0];
  if (
    identities.length !== 1 ||
    !identity ||
    (["projectId", "branchId", "endpointId", "database", "role"] as const).some(
      (key) => !identity[key] || identity[key] !== target[key],
    )
  ) {
    throw new SeedSafetyError(
      "The connected database is not the expected seed target; no replacement is permitted.",
    );
  }
}
