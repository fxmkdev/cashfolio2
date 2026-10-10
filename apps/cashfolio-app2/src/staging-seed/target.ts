import type { Prisma } from "../.prisma-client/client";

export const STAGING_SEED_ROLE = "cashfolio_staging_seed";

export class SeedSafetyError extends Error {}

export type ApprovedSeedTarget = {
  hostname: string;
  projectId: string;
  branchId: string;
  endpointId: string;
  database: string;
  role: string;
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

function requireValue(env: NodeJS.ProcessEnv, key: string): string {
  const value = env[key]?.trim();
  if (!value) throw new SeedSafetyError(`${key} is required.`);
  return value;
}

export function readSeedConfig(
  env: NodeJS.ProcessEnv = process.env,
  requireEnabled = true,
): SeedConfig {
  if (env.APP_ENVIRONMENT !== "staging") {
    throw new SeedSafetyError("Seeding is permitted only in staging.");
  }
  if (requireEnabled && env.STAGING_SEED_ENABLED !== "true") {
    throw new SeedSafetyError("Staging seeding has not been enabled.");
  }
  if (env.PGOPTIONS?.trim()) {
    throw new SeedSafetyError(
      "PGOPTIONS overrides are forbidden for staging seeding.",
    );
  }

  const target = parseApprovedTarget(requireValue(env, "STAGING_SEED_TARGET"));
  const testerExternalIds = [
    ...new Set(
      requireValue(env, "STAGING_SEED_USER_EXTERNAL_IDS")
        .split(",")
        .map((id) => id.trim()),
    ),
  ];
  if (testerExternalIds.some((id) => !id || /[\r\n]/.test(id))) {
    throw new SeedSafetyError(
      "Tester IDs must be a nonempty comma-separated list.",
    );
  }
  return {
    target,
    testerExternalIds,
    seedConnection: parseVerifiedConnection(
      requireValue(env, "STAGING_SEED_DATABASE_URL"),
      target,
    ),
  };
}

export function parseApprovedTarget(raw: string): ApprovedSeedTarget {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new SeedSafetyError("STAGING_SEED_TARGET must be valid JSON.");
  }
  const keys = [
    "hostname",
    "projectId",
    "branchId",
    "endpointId",
    "database",
    "role",
  ];
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new SeedSafetyError(
      "STAGING_SEED_TARGET must be an approved target object.",
    );
  }
  const record = value as Record<string, unknown>;
  if (
    Object.keys(record).length !== keys.length ||
    keys.some((key) => typeof record[key] !== "string" || !record[key])
  ) {
    throw new SeedSafetyError(
      "STAGING_SEED_TARGET requires hostname, projectId, branchId, endpointId, database and role.",
    );
  }
  const target = record as ApprovedSeedTarget;
  if (
    !/^ep-[a-z0-9-]+$/.test(target.endpointId) ||
    target.endpointId.endsWith("-pooler") ||
    !target.hostname.startsWith(`${target.endpointId}.`) ||
    !/^ep-[a-z0-9-]+(?:\.[a-z0-9-]+)+\.neon\.tech$/.test(target.hostname) ||
    !/^[a-z0-9-]+$/.test(target.projectId) ||
    !/^br-[a-z0-9-]+$/.test(target.branchId) ||
    !/^[a-zA-Z0-9_]+$/.test(target.database) ||
    target.role !== STAGING_SEED_ROLE
  ) {
    throw new SeedSafetyError(
      "The approved staging target must identify a direct Neon endpoint and the dedicated seed role.",
    );
  }
  return target;
}

export function parseVerifiedConnection(
  raw: string,
  target: ApprovedSeedTarget,
  migration = false,
): VerifiedConnection {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new SeedSafetyError("The database connection URL is invalid.");
  }
  const firstDot = target.hostname.indexOf(".");
  const pooledHostname = `${target.hostname.slice(0, firstDot)}-pooler${target.hostname.slice(firstDot)}`;
  let database: string;
  let user: string;
  let password: string;
  try {
    database = decodeURIComponent(url.pathname.slice(1));
    user = decodeURIComponent(url.username);
    password = decodeURIComponent(url.password);
  } catch {
    throw new SeedSafetyError(
      "The database connection URL contains invalid encoding.",
    );
  }
  if (
    !["postgres:", "postgresql:"].includes(url.protocol) ||
    url.hash ||
    (url.hostname !== target.hostname &&
      !(migration && url.hostname === pooledHostname)) ||
    (url.port && url.port !== "5432") ||
    database !== target.database ||
    !user ||
    !password ||
    (!migration && user !== target.role)
  ) {
    throw new SeedSafetyError(
      "The connection does not match the approved staging endpoint, database or role.",
    );
  }
  const allowedParameters = new Set(["sslmode", "channel_binding"]);
  const seen = new Set<string>();
  for (const [key] of url.searchParams) {
    if (!allowedParameters.has(key) || seen.has(key)) {
      throw new SeedSafetyError(
        "Unexpected or duplicate connection parameters are forbidden.",
      );
    }
    seen.add(key);
  }
  const sslmode = url.searchParams.get("sslmode");
  if (
    (sslmode !== "verify-full" && !(migration && sslmode === "require")) ||
    (url.searchParams.has("channel_binding") &&
      url.searchParams.get("channel_binding") !== "require")
  ) {
    throw new SeedSafetyError("The connection must require verified TLS.");
  }
  // Never forward a connection string or PGOPTIONS to pg. pg treats an empty
  // options string as absent, so whitespace explicitly blocks its env fallback.
  return {
    host: url.hostname,
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
      "The connected database is not the approved staging target; no replacement is permitted.",
    );
  }
}
