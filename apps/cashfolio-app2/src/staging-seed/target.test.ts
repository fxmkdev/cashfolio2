import { describe, expect, it, vi } from "vitest";
import type { Prisma } from "../.prisma-client/client";
import {
  parseApprovedTarget,
  parseVerifiedConnection,
  readSeedConfig,
  verifyServerIdentity,
  type ApprovedSeedTarget,
} from "./target";

const target: ApprovedSeedTarget = {
  hostname: "ep-seed-example.eu-central-1.aws.neon.tech",
  projectId: "test-project",
  branchId: "br-staging",
  endpointId: "ep-seed-example",
  database: "neondb",
  role: "cashfolio_staging_seed",
};
const url = `postgresql://${target.role}:secret@${target.hostname}/neondb?sslmode=verify-full`;
const env = {
  APP_ENVIRONMENT: "staging",
  STAGING_SEED_ENABLED: "true",
  STAGING_SEED_TARGET: JSON.stringify(target),
  STAGING_SEED_USER_EXTERNAL_IDS: "tester-one, tester-two,tester-one",
  STAGING_SEED_DATABASE_URL: url,
};

describe("staging seed configuration", () => {
  it("requires explicit staging enablement and deduplicates tester IDs", () => {
    expect(readSeedConfig(env).testerExternalIds).toEqual([
      "tester-one",
      "tester-two",
    ]);
    expect(
      readSeedConfig({ ...env, STAGING_SEED_ENABLED: "false" }, false),
    ).toBeDefined();
    for (const mode of [undefined, "prod", "production", "preview"]) {
      expect(() => readSeedConfig({ ...env, APP_ENVIRONMENT: mode })).toThrow(
        "only in staging",
      );
    }
    for (const enabled of [undefined, "false", "TRUE", "1"]) {
      expect(() =>
        readSeedConfig({ ...env, STAGING_SEED_ENABLED: enabled }),
      ).toThrow("not been enabled");
    }
  });

  it.each([
    "STAGING_SEED_DATABASE_URL",
    "STAGING_SEED_TARGET",
    "STAGING_SEED_USER_EXTERNAL_IDS",
  ])("requires %s without falling back to generic DATABASE_URL", (key) => {
    expect(() =>
      readSeedConfig({ ...env, [key]: undefined, DATABASE_URL: url }),
    ).toThrow("required");
  });

  it.each([",", "tester,", "tester\nother"])(
    "rejects empty or multiline identities %j",
    (value) => {
      expect(() =>
        readSeedConfig({ ...env, STAGING_SEED_USER_EXTERNAL_IDS: value }),
      ).toThrow("Tester IDs");
    },
  );

  it.each([
    "{",
    "null",
    "[]",
    '"value"',
    JSON.stringify({ ...target, role: undefined }),
    JSON.stringify({ ...target, extra: true }),
    JSON.stringify({ ...target, role: "neondb_owner" }),
    JSON.stringify({
      ...target,
      hostname: "ep-production.eu-central-1.aws.neon.tech",
    }),
    JSON.stringify({ ...target, database: "db/options" }),
    JSON.stringify({
      ...target,
      endpointId: "ep-seed-example-pooler",
      hostname: "ep-seed-example-pooler.eu-central-1.aws.neon.tech",
    }),
    JSON.stringify({ ...target, projectId: "" }),
    JSON.stringify({ ...target, branchId: "production" }),
  ])("rejects an invalid approved target", (raw) => {
    expect(() => parseApprovedTarget(raw)).toThrow();
  });
});

describe("staging connection restrictions", () => {
  it("rejects environment routing overrides", () => {
    expect(() =>
      readSeedConfig({ ...env, PGOPTIONS: "endpoint=ep-production" }),
    ).toThrow("PGOPTIONS");
  });

  it("constructs explicit connection properties with verified TLS and no PGOPTIONS", () => {
    expect(
      parseVerifiedConnection(`${url}&channel_binding=require`, target),
    ).toEqual({
      host: target.hostname,
      port: 5432,
      user: target.role,
      password: "secret",
      database: "neondb",
      ssl: { rejectUnauthorized: true },
      options: " ",
      enableChannelBinding: true,
      connectionTimeoutMillis: 20_000,
      max: 1,
    });
    expect(
      parseVerifiedConnection(
        url.replace(":secret@", ":p%40ss%3Aword@"),
        target,
      ).password,
    ).toBe("p@ss:word");
  });

  it.each([
    "not-a-url",
    url.replace("postgresql:", "https:"),
    url.replace("ep-seed-example", "ep-production"),
    url.replace("neon.tech", "neon.tech.evil.example"),
    url.replace("ep-seed-example", "ep-seed-example-pooler"),
    url.replace("/neondb", ":5433/neondb"),
    url.replace("/neondb", "/otherdb"),
    url.replace("/neondb", "/neondb/other"),
    url.replace("cashfolio_staging_seed", "neondb_owner"),
    url.replace(":secret", ""),
    url.replace("secret", "%ZZ"),
    url.replace("verify-full", "require"),
    url.replace("verify-full", "disable"),
    url.replace("?sslmode=verify-full", ""),
    `${url}#fragment`,
    `${url}&sslmode=disable`,
    `${url}&channel_binding=disable`,
    `${url}&options=endpoint%3Dep-production`,
    `${url}&host=production`,
    `${url}&hostaddr=127.0.0.1`,
    `${url}&dbname=production`,
    `${url}&user=owner`,
    `${url}&sslcert=some-file`,
  ])("rejects a destination or connection override", (connection) => {
    expect(() => parseVerifiedConnection(connection, target)).toThrow();
  });

  it("allows only the same endpoint's migration role and pooled address, still verifies TLS", () => {
    const migration = url
      .replace("cashfolio_staging_seed", "neondb_owner")
      .replace("ep-seed-example", "ep-seed-example-pooler")
      .replace("verify-full", "require");
    expect(parseVerifiedConnection(migration, target, true)).toMatchObject({
      user: "neondb_owner",
      ssl: { rejectUnauthorized: true },
    });
    expect(() =>
      parseVerifiedConnection(
        migration.replace("ep-seed-example-pooler", "ep-production"),
        target,
        true,
      ),
    ).toThrow();
  });
});

describe("server identity verification", () => {
  const identity = {
    projectId: target.projectId,
    branchId: target.branchId,
    endpointId: target.endpointId,
    database: target.database,
    role: target.role,
  };
  const connection = (rows: unknown[]) =>
    ({ $queryRaw: vi.fn().mockResolvedValue(rows) }) as unknown as Pick<
      Prisma.TransactionClient,
      "$queryRaw"
    >;

  it("accepts the immutable staging server identity", async () => {
    await expect(
      verifyServerIdentity(connection([identity]), target),
    ).resolves.toBeUndefined();
  });

  it.each(["projectId", "branchId", "endpointId", "database", "role"])(
    "fails closed for missing or mismatched %s",
    async (key) => {
      for (const value of [null, "", "production"]) {
        await expect(
          verifyServerIdentity(
            connection([{ ...identity, [key]: value }]),
            target,
          ),
        ).rejects.toThrow("no replacement");
      }
    },
  );

  it("rejects an unexpected row count", async () => {
    for (const rows of [[], [identity, identity]]) {
      await expect(
        verifyServerIdentity(connection(rows), target),
      ).rejects.toThrow("no replacement");
    }
  });
});
