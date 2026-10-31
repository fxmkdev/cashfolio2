import { beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({
  create: vi.fn(),
  verify: vi.fn(),
  replace: vi.fn(),
  generate: vi.fn(),
  csv: vi.fn(),
  exec: vi.fn(),
}));
vi.mock("node:child_process", () => ({
  execFile: (
    file: string,
    args: string[],
    options: unknown,
    callback: (error: Error | null) => void,
  ) => mock.exec(file, args, options, callback),
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
  environment: "staging",
  flyApp: "cashfolio-staging",
  migrationRole: "owner",
  hostname: "ep-staging.eu-central-1.aws.neon.tech",
  projectId: "test-project",
  branchId: "br-staging",
  endpointId: "ep-staging",
  database: "neondb",
  role: "cashfolio_staging_seed",
};
const env = {
  APP_ENVIRONMENT: "staging",
  FLY_APP_NAME: "cashfolio-staging",
  SEED_ADMIN_EXTERNAL_IDS: "tester",
  SEED_TARGET: JSON.stringify(target),
  SEED_USER_EXTERNAL_IDS: "tester",
  SEED_DATABASE_URL: `postgresql://${target.role}:secret@${target.hostname}/neondb?sslmode=verify-full`,
  DATABASE_URL: `postgresql://owner:secret@${target.hostname}/neondb?sslmode=require`,
};

beforeEach(() => {
  vi.clearAllMocks();
  mock.create.mockImplementation(() => ({
    $disconnect: vi.fn().mockResolvedValue(undefined),
    $executeRawUnsafe: vi.fn().mockResolvedValue(0),
  }));
  mock.verify.mockResolvedValue(undefined);
  mock.exec.mockImplementation(
    (
      _file: string,
      _args: string[],
      _options: unknown,
      callback: (error: Error | null) => void,
    ) => callback(null),
  );
  mock.generate.mockReturnValue({ books: [] });
  mock.replace.mockResolvedValue({ testers: 1, books: [] });
  mock.csv.mockReturnValue("sample-csv");
});

describe("seed command", () => {
  it("checks both dedicated seed and migration connections without replacing anything", async () => {
    await expect(
      runStagingSeed(["--check-target"], {
        ...env,
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
    { SEED_DATABASE_URL: undefined },
    { SEED_TARGET: undefined },
    { SEED_USER_EXTERNAL_IDS: undefined },
    { SEED_ADMIN_EXTERNAL_IDS: undefined },
    {
      SEED_DATABASE_URL: env.SEED_DATABASE_URL.replace(
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
      expect(mock.create).not.toHaveBeenCalled();
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
    await expect(runStagingSeed([], env)).resolves.toContain("seed_complete");
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

it("verifies both destinations before granting narrowly scoped seed permissions", async () => {
  await runStagingSeed(["--grant-permissions"], env);
  expect(mock.verify).toHaveBeenCalledTimes(2);
  const migration = mock.create.mock.results[1].value;
  expect(migration.$executeRawUnsafe.mock.calls).toHaveLength(3);
  const tableGrant = migration.$executeRawUnsafe.mock.calls[1][0];
  for (const table of [
    "Booking",
    "ClassificationScheme",
    "ClassificationNode",
    "AccountClassification",
  ])
    expect(tableGrant).toContain(`"${table}"`);
  const functionGrant = migration.$executeRawUnsafe.mock.calls[2][0];
  for (const signature of [
    "ensure_gain_loss_account_for_new_book()",
    "initialize_book_classifications()",
    "seed_asset_class_scheme(text)",
  ])
    expect(functionGrant).toContain(`public.${signature}`);
  expect(migration.$executeRawUnsafe.mock.calls.join(" ")).not.toMatch(
    /ALL TABLES|neon_superuser|CREATEROLE|TRUNCATE|AuthSession|AuthSubjectRevocation/,
  );
  expect(mock.replace).not.toHaveBeenCalled();
});

it("never grants permissions when target verification fails", async () => {
  mock.verify.mockRejectedValueOnce(new Error("wrong target"));
  await expect(runStagingSeed(["--grant-permissions"], env)).rejects.toThrow(
    "wrong target",
  );
  expect(
    mock.create.mock.results[1].value.$executeRawUnsafe,
  ).not.toHaveBeenCalled();
});

it("release verifies before migrations, grants afterwards, and replaces only after grants", async () => {
  await expect(runStagingSeed(["--release"], env)).resolves.toContain(
    "seed_complete",
  );
  expect(mock.exec).toHaveBeenCalledExactlyOnceWith(
    "sh",
    [expect.stringMatching(/\/scripts\/prisma-migrate-deploy-with-retry\.sh$/)],
    expect.objectContaining({
      env: expect.objectContaining({ APP_ENVIRONMENT: "staging" }),
    }),
    expect.any(Function),
  );
  expect(mock.verify.mock.invocationCallOrder[1]).toBeLessThan(
    mock.exec.mock.invocationCallOrder[0],
  );
  const grants = mock.create.mock.results[3].value.$executeRawUnsafe;
  expect(grants).toHaveBeenCalledTimes(3);
  expect(mock.exec.mock.invocationCallOrder[0]).toBeLessThan(
    grants.mock.invocationCallOrder[0],
  );
  expect(grants.mock.invocationCallOrder[2]).toBeLessThan(
    mock.replace.mock.invocationCallOrder[0],
  );
  expect(
    mock.create.mock.results.every(
      ({ value }) => value.$disconnect.mock.calls.length === 1,
    ),
  ).toBe(true);
});

it.each([
  env.DATABASE_URL,
  env.DATABASE_URL.replace("require", "verify-full") +
    "&channel_binding=require",
  env.DATABASE_URL.replace("ep-staging.", "ep-staging-pooler."),
])(
  "enforces Prisma migration TLS without changing the verified destination or parent environment",
  async (databaseUrl) => {
    const sourceEnv = { ...env, DATABASE_URL: databaseUrl };
    await runStagingSeed(["--release"], sourceEnv);
    const options = mock.exec.mock.calls[0][2] as { env: NodeJS.ProcessEnv };
    const migrationUrl = new URL(options.env.DATABASE_URL!);
    const approvedUrl = new URL(databaseUrl);
    expect(migrationUrl.protocol).toBe(approvedUrl.protocol);
    expect(migrationUrl.host).toBe(approvedUrl.host);
    expect(migrationUrl.pathname).toBe(approvedUrl.pathname);
    expect(migrationUrl.username).toBe(approvedUrl.username);
    expect(migrationUrl.password).toBe(approvedUrl.password);
    expect(migrationUrl.searchParams.get("sslmode")).toBe("require");
    expect(migrationUrl.searchParams.get("sslaccept")).toBe("strict");
    expect(migrationUrl.searchParams.get("channel_binding")).toBe(
      approvedUrl.searchParams.get("channel_binding"),
    );
    expect(sourceEnv.DATABASE_URL).toBe(databaseUrl);
    expect(options.env.SEED_DATABASE_URL).toBe(sourceEnv.SEED_DATABASE_URL);
  },
);

it("target failure prevents release migrations and all grants", async () => {
  mock.verify.mockRejectedValueOnce(new Error("wrong server"));
  await expect(runStagingSeed(["--release"], env)).rejects.toThrow(
    "wrong server",
  );
  expect(mock.exec).not.toHaveBeenCalled();
  expect(mock.replace).not.toHaveBeenCalled();
});

it("migration failure stops the release and suppresses raw credentials in diagnostics", async () => {
  mock.exec.mockImplementation(
    (
      _file: string,
      _args: string[],
      _options: unknown,
      callback: (error: Error | null) => void,
    ) => callback(new Error("secret-connection-string")),
  );
  await expect(runStagingSeed(["--release"], env)).rejects.toThrow(
    "Migration failed; seeding was not attempted.",
  );
  expect(mock.replace).not.toHaveBeenCalled();
  expect(mock.create).toHaveBeenCalledTimes(2);
});
