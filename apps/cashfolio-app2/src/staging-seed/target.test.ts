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
  environment: "staging",
  flyApp: "cashfolio-staging",
  migrationRole: "owner",
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
  FLY_APP_NAME: "cashfolio-staging",
  SEED_ADMIN_EXTERNAL_IDS: "tester-one",
  SEED_TARGET: JSON.stringify(target),
  SEED_USER_EXTERNAL_IDS: "tester-one, tester-two,tester-one",
  SEED_DATABASE_URL: url,
};

describe("staging seed configuration", () => {
  it("permits only staging and preview and deduplicates tester IDs", () => {
    expect(readSeedConfig(env).testerExternalIds).toEqual([
      "tester-one",
      "tester-two",
    ]);
    for (const mode of [undefined, "prod", "production", "local"]) {
      expect(() => readSeedConfig({ ...env, APP_ENVIRONMENT: mode })).toThrow(
        "only in staging or preview",
      );
    }
    expect(() =>
      readSeedConfig({ ...env, APP_ENVIRONMENT: "preview" }),
    ).toThrow("does not match");
    expect(() =>
      readSeedConfig({ ...env, FLY_APP_NAME: "production" }),
    ).toThrow("does not match");
    expect(() =>
      readSeedConfig({ ...env, SEED_ADMIN_EXTERNAL_IDS: "unconfigured" }),
    ).toThrow("also be configured testers");
  });

  it.each([
    "SEED_DATABASE_URL",
    "SEED_TARGET",
    "SEED_USER_EXTERNAL_IDS",
    "SEED_ADMIN_EXTERNAL_IDS",
  ])("requires %s without falling back to generic DATABASE_URL", (key) => {
    expect(() =>
      readSeedConfig({ ...env, [key]: undefined, DATABASE_URL: url }),
    ).toThrow("required");
  });

  it.each([",", "tester,", "tester\nother"])(
    "rejects empty or multiline identities %j",
    (value) => {
      expect(() =>
        readSeedConfig({ ...env, SEED_USER_EXTERNAL_IDS: value }),
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
    url.replace("cashfolio_staging_seed", "owner"),
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
      .replace("cashfolio_staging_seed", "owner")
      .replace("ep-seed-example", "ep-seed-example-pooler")
      .replace("verify-full", "require");
    expect(
      parseVerifiedConnection(migration, { ...target, role: "owner" }, true),
    ).toMatchObject({
      user: "owner",
      ssl: { rejectUnauthorized: true },
    });
    expect(() =>
      parseVerifiedConnection(
        migration.replace("ep-seed-example-pooler", "ep-production"),
        { ...target, role: "owner" },
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

describe("preview target isolation", () => {
  const previewTarget: ApprovedSeedTarget = {
    ...target,
    environment: "preview",
    flyApp: "cashfolio-app2-pr-42-topic",
    database: "pr-42-improve-seed-cashfolio-app2",
    role: "cashfolio_pr_42_seed",
    migrationRole: "cashfolio_pr_42_app",
  };
  it("accepts exact preview-only database and role configuration", () => {
    expect(
      readSeedConfig({
        ...env,
        APP_ENVIRONMENT: "preview",
        FLY_APP_NAME: previewTarget.flyApp,
        SEED_TARGET: JSON.stringify(previewTarget),
        SEED_DATABASE_URL: `postgresql://${previewTarget.role}:secret@${previewTarget.hostname}/${previewTarget.database}?sslmode=verify-full`,
      }).target,
    ).toEqual(previewTarget);
  });
  it.each([
    { environment: "prod" },
    { flyApp: "cashfolio-app2-pr-43-topic" },
    { database: "production" },
    { role: "cashfolio_staging_seed" },
    { migrationRole: "neondb_owner" },
    { database: "pr-43-topic-cashfolio-app2" },
  ])("rejects cross-environment and cross-PR targets %j", (overrides) => {
    expect(() =>
      parseApprovedTarget(JSON.stringify({ ...previewTarget, ...overrides })),
    ).toThrow();
  });
  it("rejects a different migration role even on the correct database", () => {
    expect(() =>
      parseVerifiedConnection(
        url.replace(target.role, "other"),
        { ...target, role: "owner" },
        true,
      ),
    ).toThrow();
  });
});
