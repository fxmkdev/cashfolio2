import { describe, expect, it, vi } from "vitest";
import type { Prisma } from "../.prisma-client/client";
import {
  parseApprovedTarget,
  validateApprovedTarget,
  validateNeonTarget,
  readSeedUsers,
  parseVerifiedConnection,
  readSeedConfig,
  verifyServerIdentity,
  type ApprovedSeedTarget,
} from "./target";

const target: ApprovedSeedTarget = {
  environment: "staging",
  flyApp: "cashfolio-staging",
  hostname: "ep-seed-example.eu-central-1.aws.neon.tech",
  projectId: "test-project",
  branchId: "br-staging",
  endpointId: "ep-seed-example",
  database: "cashfolio-app2-main-aaaaaaaa",
  role: "owner",
};
const url = `postgresql://${target.role}:secret@${target.hostname}/cashfolio-app2-main-aaaaaaaa?sslmode=verify-full`;
const env = {
  NONPRODUCTION_NEON_PROJECT_ID: "test-project",
  APP_ENVIRONMENT: "staging",
  FLY_APP_NAME: "cashfolio-staging",
  SEED_ADMIN_EXTERNAL_IDS: "tester-one",
  SEED_TARGET: JSON.stringify(target),
  SEED_USER_EXTERNAL_IDS: "tester-one, tester-two,tester-one",
  DATABASE_URL: url,
};

it("shares tester/admin parsing without granting administrator status to unconfigured testers", () => {
  expect(readSeedUsers(env)).toEqual({
    testerExternalIds: ["tester-one", "tester-two"],
    adminExternalIds: ["tester-one"],
  });
  expect(() =>
    readSeedUsers({ ...env, SEED_ADMIN_EXTERNAL_IDS: "outsider" }),
  ).toThrow("also be configured testers");
});

it("validates internal objects and JSON boundaries with the same strict rules", () => {
  const { environment: _environment, flyApp: _flyApp, ...neonTarget } = target;
  expect(validateNeonTarget(neonTarget)).toEqual(neonTarget);
  expect(validateApprovedTarget(target)).toEqual(
    parseApprovedTarget(JSON.stringify(target)),
  );
  for (const invalid of [
    null,
    [],
    "text",
    { ...target, extra: true },
    { ...target, role: "bad/role" },
  ]) {
    expect(() => validateApprovedTarget(invalid)).toThrow();
    expect(() => parseApprovedTarget(JSON.stringify(invalid))).toThrow();
  }
});

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
    "DATABASE_URL",
    "SEED_TARGET",
    "SEED_USER_EXTERNAL_IDS",
    "SEED_ADMIN_EXTERNAL_IDS",
    "NONPRODUCTION_NEON_PROJECT_ID",
  ])("requires %s", (key) => {
    expect(() => readSeedConfig({ ...env, [key]: undefined })).toThrow(
      "required",
    );
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
    JSON.stringify({ ...target, role: "bad/role" }),
    JSON.stringify({ ...target, migrationRole: "obsolete" }),
    JSON.stringify({
      ...target,
      hostname: "ep-production.eu-central-1.aws.neon.tech",
    }),
    JSON.stringify({ ...target, database: "db/options" }),
    JSON.stringify({ ...target, database: "neondb" }),
    JSON.stringify({ ...target, flyApp: "cashfolio-app2-pr-42-topic" }),
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
      database: "cashfolio-app2-main-aaaaaaaa",
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
    url.replace(
      "/cashfolio-app2-main-aaaaaaaa",
      ":5433/cashfolio-app2-main-aaaaaaaa",
    ),
    url.replace("/cashfolio-app2-main-aaaaaaaa", "/otherdb"),
    url.replace(
      "/cashfolio-app2-main-aaaaaaaa",
      "/cashfolio-app2-main-aaaaaaaa/other",
    ),
    url.replace("owner", "other"),
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

  it("accepts the same endpoint’s application URL with verified TLS", () => {
    const migration = url
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
    database: "cashfolio-app2-topic-bbbbbbbb",
  };
  it("accepts a separate preview database with the shared owner on staging’s exact host", () => {
    expect(
      readSeedConfig({
        ...env,
        APP_ENVIRONMENT: "preview",
        FLY_APP_NAME: previewTarget.flyApp,
        SEED_TARGET: JSON.stringify(previewTarget),
        DATABASE_URL: `postgresql://${previewTarget.role}:secret@${previewTarget.hostname}/${previewTarget.database}?sslmode=verify-full`,
      }).target,
    ).toEqual(previewTarget);
  });
  it("rejects staging/preview connection swaps even with identical Neon host identifiers", async () => {
    const previewUrl = `postgresql://${previewTarget.role}:secret@${previewTarget.hostname}/${previewTarget.database}?sslmode=verify-full`;
    for (const [expected, wrongUrl] of [
      [previewTarget, url],
      [target, previewUrl],
    ] as const) {
      expect(() => parseVerifiedConnection(wrongUrl, expected)).toThrow();
    }
    const connection = (identity: unknown) =>
      ({ $queryRaw: vi.fn().mockResolvedValue([identity]) }) as unknown as Pick<
        Prisma.TransactionClient,
        "$queryRaw"
      >;
    for (const [expected, other] of [
      [previewTarget, target],
      [target, previewTarget],
    ] as const) {
      const identity = {
        projectId: expected.projectId,
        branchId: expected.branchId,
        endpointId: expected.endpointId,
        database: expected.database,
        role: expected.role,
      };
      await expect(
        verifyServerIdentity(connection(identity), expected),
      ).resolves.toBeUndefined();
      for (const key of ["database", "role"] as const)
        await expect(
          verifyServerIdentity(
            connection({
              ...identity,
              [key]: key === "role" ? "wrong_role" : other[key],
            }),
            expected,
          ),
        ).rejects.toThrow("no replacement");
    }
  });
  it.each([
    { environment: "prod" },
    { flyApp: "cashfolio-staging" },
    { database: "production" },
    { role: "bad/role" },
    { migrationRole: "cashfolio-app2-main-aaaaaaaa_owner" },
    { database: "pr-43-topic-cashfolio-app2" },
  ])("rejects cross-environment and unmanaged targets %j", (overrides) => {
    expect(() =>
      parseApprovedTarget(JSON.stringify({ ...previewTarget, ...overrides })),
    ).toThrow();
  });
  it("rejects a different login even on the correct database", () => {
    expect(() =>
      parseVerifiedConnection(
        url.replace(target.role, "other"),
        { ...target, role: "owner" },
        true,
      ),
    ).toThrow();
  });
});
