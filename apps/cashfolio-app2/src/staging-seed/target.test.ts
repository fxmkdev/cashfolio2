import { describe, expect, it, vi } from "vitest";
import type { Prisma } from "../.prisma-client/client";
import {
  parseManualSeedInput,
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
  role: "neondb_owner",
};
const url = `postgresql://${target.role}:secret@${target.hostname}/neondb?sslmode=require`;
const input = {
  projectId: target.projectId,
  branchId: target.branchId,
  testerExternalIds: [" tester-one ", "tester-two", "tester-one"],
};
const raw = JSON.stringify(input);
const env = { APP_ENVIRONMENT: "staging", DATABASE_URL: url };

describe("manual seed configuration", () => {
  it.each(["staging", "preview"])(
    "accepts %s and deduplicates tester IDs",
    (environment) => {
      const config = readSeedConfig(raw, {
        ...env,
        APP_ENVIRONMENT: environment,
      });
      expect(config.target).toEqual(target);
      expect(config.testerExternalIds).toEqual(["tester-one", "tester-two"]);
    },
  );

  it.each([undefined, "prod", "production", "e2e", ""])(
    "rejects environment %j",
    (environment) => {
      expect(() =>
        readSeedConfig(raw, { ...env, APP_ENVIRONMENT: environment }),
      ).toThrow("only in staging and preview");
    },
  );

  it.each([
    "",
    "{",
    "null",
    "[]",
    '"value"',
    JSON.stringify({ ...input, projectId: undefined }),
    JSON.stringify({ ...input, projectId: "" }),
    JSON.stringify({ ...input, projectId: "project/other" }),
    JSON.stringify({ ...input, branchId: "staging" }),
    JSON.stringify({ ...input, extra: true }),
    ...[[], [""], ["tester", " "], ["tester\nother"], [null], "tester"].map(
      (testerExternalIds) => JSON.stringify({ ...input, testerExternalIds }),
    ),
  ])("rejects malformed or incomplete stdin input %j", (value) => {
    expect(() => parseManualSeedInput(value)).toThrow();
  });

  it("requires DATABASE_URL and rejects PGOPTIONS", () => {
    expect(() => readSeedConfig(raw, { APP_ENVIRONMENT: "staging" })).toThrow(
      "DATABASE_URL",
    );
    expect(() =>
      readSeedConfig(raw, { ...env, PGOPTIONS: "endpoint=ep-production" }),
    ).toThrow("PGOPTIONS");
  });

  it("normalizes pooled connections, verifies TLS and blocks pg environment routing", () => {
    const pooled = url.replace("ep-seed-example", "ep-seed-example-pooler");
    expect(
      readSeedConfig(raw, {
        ...env,
        DATABASE_URL: `${pooled}&channel_binding=require&schema=public`,
      }),
    ).toEqual({
      target,
      testerExternalIds: ["tester-one", "tester-two"],
      seedConnection: {
        host: target.hostname,
        port: 5432,
        database: "neondb",
        user: target.role,
        password: "secret",
        ssl: { rejectUnauthorized: true },
        options: " ",
        enableChannelBinding: true,
        connectionTimeoutMillis: 20_000,
        max: 1,
      },
    });
    expect(
      readSeedConfig(raw, {
        ...env,
        DATABASE_URL: url
          .replace("secret", "p%40ss%3Aword")
          .replace("require", "verify-full"),
      }).seedConnection.password,
    ).toBe("p@ss:word");
  });

  it.each([
    "not-a-url",
    url.replace("postgresql:", "https:"),
    url.replace("neon.tech", "neon.tech.evil.example"),
    url.replace("ep-seed-example", "not-neon"),
    url.replace("/neondb", ":5433/neondb"),
    url.replace("/neondb", "/neondb/other"),
    url.replace(":secret", ""),
    url.replace("secret", "%ZZ"),
    url.replace("neondb_owner", "%ZZ"),
    url.replace("require", "disable"),
    url.replace("?sslmode=require", ""),
    `${url}#fragment`,
    `${url}&sslmode=disable`,
    `${url}&channel_binding=disable`,
    `${url}&schema=other`,
    `${url}&options=endpoint%3Dep-production`,
    `${url}&host=production`,
    `${url}&hostaddr=127.0.0.1`,
    `${url}&dbname=production`,
    `${url}&user=owner`,
    `${url}&sslcert=some-file`,
  ])("rejects invalid connections and routing overrides", (connection) => {
    expect(() =>
      readSeedConfig(raw, { ...env, DATABASE_URL: connection }),
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
