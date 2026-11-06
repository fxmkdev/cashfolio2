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
  hostname: "ep-staging.eu-central-1.aws.neon.tech",
  projectId: "test-project",
  branchId: "br-staging",
  endpointId: "ep-staging",
  database: "cashfolio-app2-main-aaaaaaaa",
  role: "owner",
};
const env = {
  APP_ENVIRONMENT: "staging",
  FLY_APP_NAME: "cashfolio-staging",
  SEED_ADMIN_EXTERNAL_IDS: "tester",
  SEED_TARGET: JSON.stringify(target),
  SEED_USER_EXTERNAL_IDS: "tester",
  DATABASE_URL: `postgresql://owner:secret@${target.hostname}/cashfolio-app2-main-aaaaaaaa?sslmode=require`,
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
  it("checks the application connection without replacing anything", async () => {
    await expect(
      runStagingSeed(["--check-target"], {
        ...env,
      }),
    ).resolves.toContain("target_verified");
    expect(mock.verify).toHaveBeenNthCalledWith(1, expect.anything(), target);
    expect(mock.create).toHaveBeenCalledOnce();
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
    { DATABASE_URL: undefined },
    { SEED_TARGET: undefined },
    { SEED_USER_EXTERNAL_IDS: undefined },
    { SEED_ADMIN_EXTERNAL_IDS: undefined },
    {
      DATABASE_URL: env.DATABASE_URL.replace("ep-staging", "ep-production"),
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

  it("disconnects the client after a server identity failure without writing", async () => {
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

  it("runs replacement only with approved staging configuration and disconnects", async () => {
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

it("release verifies before migrations and replaces only after migration success", async () => {
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
  expect(mock.verify.mock.invocationCallOrder[0]).toBeLessThan(
    mock.exec.mock.invocationCallOrder[0],
  );
  expect(mock.exec.mock.invocationCallOrder[0]).toBeLessThan(
    mock.replace.mock.invocationCallOrder[0],
  );
  expect(mock.create).toHaveBeenCalledTimes(2);
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
  },
);

it("target failure prevents release migrations and replacement", async () => {
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
  expect(mock.create).toHaveBeenCalledOnce();
});
