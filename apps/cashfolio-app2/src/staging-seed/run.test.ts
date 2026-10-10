import { beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({
  create: vi.fn(),
  verify: vi.fn(),
  replace: vi.fn(),
  generate: vi.fn(),
  csv: vi.fn(),
}));
vi.mock("./connections", () => ({ createSeedClient: mock.create }));
vi.mock("./writer", () => ({ replaceStagingData: mock.replace }));
vi.mock("./dataset", () => ({
  generateStagingDataset: mock.generate,
  generateStatementImportSample: mock.csv,
}));
vi.mock("./target", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./target")>()),
  verifyServerIdentity: mock.verify,
}));

import { runStagingSeed } from "./run";

const target = {
  hostname: "ep-staging.eu-central-1.aws.neon.tech",
  projectId: "test-project",
  branchId: "br-staging",
  endpointId: "ep-staging",
  database: "neondb",
  role: "cashfolio_staging_seed",
};
const env = {
  APP_ENVIRONMENT: "staging",
  STAGING_SEED_ENABLED: "true",
  STAGING_SEED_TARGET: JSON.stringify(target),
  STAGING_SEED_USER_EXTERNAL_IDS: "tester",
  STAGING_SEED_DATABASE_URL: `postgresql://${target.role}:secret@${target.hostname}/neondb?sslmode=verify-full`,
  DATABASE_URL: `postgresql://owner:secret@${target.hostname}/neondb?sslmode=require`,
};

beforeEach(() => {
  vi.clearAllMocks();
  mock.create.mockImplementation(() => ({
    $disconnect: vi.fn().mockResolvedValue(undefined),
  }));
  mock.verify.mockResolvedValue(undefined);
  mock.generate.mockReturnValue({ books: [] });
  mock.replace.mockResolvedValue({ testers: 1, books: [] });
  mock.csv.mockReturnValue("sample-csv");
});

describe("seed command", () => {
  it("checks both dedicated seed and migration connections without replacing anything", async () => {
    await expect(
      runStagingSeed(["--check-target"], {
        ...env,
        STAGING_SEED_ENABLED: "false",
      }),
    ).resolves.toContain("target_verified");
    expect(mock.verify).toHaveBeenNthCalledWith(1, expect.anything(), target);
    expect(mock.verify).toHaveBeenNthCalledWith(2, expect.anything(), {
      ...target,
      role: "owner",
    });
    expect(mock.replace).not.toHaveBeenCalled();
    expect(mock.generate).not.toHaveBeenCalled();
    expect(
      mock.create.mock.results.every(
        ({ value }) => value.$disconnect.mock.calls.length === 1,
      ),
    ).toBe(true);
  });

  it.each([
    { APP_ENVIRONMENT: "prod" },
    { APP_ENVIRONMENT: "preview" },
    { PGOPTIONS: "endpoint=ep-production" },
    { STAGING_SEED_DATABASE_URL: undefined },
    { STAGING_SEED_TARGET: undefined },
    { STAGING_SEED_USER_EXTERNAL_IDS: undefined },
    { STAGING_SEED_ENABLED: "false" },
    {
      STAGING_SEED_DATABASE_URL: env.STAGING_SEED_DATABASE_URL.replace(
        "ep-staging",
        "ep-production",
      ),
    },
  ])(
    "performs zero connections or writes for an unsafe configuration",
    async (overrides) => {
      await expect(
        runStagingSeed([], { ...env, ...overrides }),
      ).rejects.toThrow();
      expect(mock.create).not.toHaveBeenCalled();
      expect(mock.replace).not.toHaveBeenCalled();
    },
  );

  it.each([
    undefined,
    env.DATABASE_URL.replace("ep-staging", "ep-production"),
    `${env.DATABASE_URL}&options=endpoint%3Dep-production`,
  ])(
    "blocks unsafe staging migration targets before connecting",
    async (databaseUrl) => {
      await expect(
        runStagingSeed(["--check-target"], {
          ...env,
          DATABASE_URL: databaseUrl,
        }),
      ).rejects.toThrow();
      expect(mock.verify).not.toHaveBeenCalled();
      expect(mock.replace).not.toHaveBeenCalled();
      expect(
        mock.create.mock.results[0].value.$disconnect,
      ).toHaveBeenCalledOnce();
    },
  );

  it("disconnects both clients after a server identity failure without writing", async () => {
    mock.verify.mockRejectedValueOnce(new Error("mismatched server identity"));
    await expect(runStagingSeed(["--check-target"], env)).rejects.toThrow(
      "identity",
    );
    expect(mock.replace).not.toHaveBeenCalled();
    expect(
      mock.create.mock.results.every(
        ({ value }) => value.$disconnect.mock.calls.length === 1,
      ),
    ).toBe(true);
  });

  it("runs replacement only with explicit staging enablement and disconnects", async () => {
    await expect(runStagingSeed([], env)).resolves.toContain(
      "staging_seed_complete",
    );
    expect(mock.replace).toHaveBeenCalledOnce();
    expect(
      mock.create.mock.results[0].value.$disconnect,
    ).toHaveBeenCalledOnce();
  });

  it("disconnects after a failed replacement", async () => {
    mock.replace.mockRejectedValueOnce(new Error("write failed"));
    await expect(runStagingSeed([], env)).rejects.toThrow("write failed");
    expect(
      mock.create.mock.results[0].value.$disconnect,
    ).toHaveBeenCalledOnce();
  });

  it("exports an import sample without configuration or any connections", async () => {
    await expect(runStagingSeed(["--sample-csv"], {})).resolves.toBe(
      "sample-csv",
    );
    expect(mock.create).not.toHaveBeenCalled();
  });

  it("rejects unknown arguments before connecting", async () => {
    await expect(runStagingSeed(["--force"], env)).rejects.toThrow("Usage");
    expect(mock.create).not.toHaveBeenCalled();
  });
});
