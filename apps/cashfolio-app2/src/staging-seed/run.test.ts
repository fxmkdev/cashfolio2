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
  DATABASE_URL: `postgresql://${target.role}:secret@${target.hostname}/neondb?sslmode=require`,
};
const input = JSON.stringify({
  projectId: target.projectId,
  branchId: target.branchId,
  testerExternalIds: ["tester"],
});

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
  it.each([
    { APP_ENVIRONMENT: "prod" },
    { APP_ENVIRONMENT: undefined },
    { PGOPTIONS: "endpoint=ep-production" },
    { DATABASE_URL: undefined },
    { DATABASE_URL: `${env.DATABASE_URL}&options=endpoint%3Dep-production` },
  ])(
    "performs zero connections or writes for unsafe configuration",
    async (overrides) => {
      await expect(
        runStagingSeed(["--manual"], { ...env, ...overrides }, input),
      ).rejects.toThrow();
      expect(mock.create).not.toHaveBeenCalled();
      expect(mock.replace).not.toHaveBeenCalled();
    },
  );

  it.each(["", "{}", "{"])(
    "rejects invalid stdin before connecting",
    async (raw) => {
      await expect(runStagingSeed(["--manual"], env, raw)).rejects.toThrow();
      expect(mock.create).not.toHaveBeenCalled();
    },
  );

  it("disconnects after an identity mismatch without generating or replacing data", async () => {
    mock.verify.mockRejectedValueOnce(new Error("mismatched server identity"));
    await expect(runStagingSeed(["--manual"], env, input)).rejects.toThrow(
      "identity",
    );
    expect(mock.replace).not.toHaveBeenCalled();
    expect(mock.generate).not.toHaveBeenCalled();
    expect(
      mock.create.mock.results[0].value.$disconnect,
    ).toHaveBeenCalledOnce();
  });

  it.each(["staging", "preview"])(
    "seeds %s only after verifying the expected server",
    async (environment) => {
      await expect(
        runStagingSeed(
          ["--manual"],
          { ...env, APP_ENVIRONMENT: environment },
          input,
        ),
      ).resolves.toContain("staging_seed_complete");
      expect(mock.verify).toHaveBeenCalledWith(expect.anything(), target);
      expect(mock.replace).toHaveBeenCalledOnce();
      expect(mock.verify.mock.invocationCallOrder[0]).toBeLessThan(
        mock.replace.mock.invocationCallOrder[0],
      );
      expect(
        mock.create.mock.results[0].value.$disconnect,
      ).toHaveBeenCalledOnce();
    },
  );

  it("disconnects after a failed replacement", async () => {
    mock.replace.mockRejectedValueOnce(new Error("write failed"));
    await expect(runStagingSeed(["--manual"], env, input)).rejects.toThrow(
      "write failed",
    );
    expect(
      mock.create.mock.results[0].value.$disconnect,
    ).toHaveBeenCalledOnce();
  });

  it("exports an import sample without configuration or connections", async () => {
    await expect(runStagingSeed(["--sample-csv"], {})).resolves.toBe(
      "sample-csv",
    );
    expect(mock.create).not.toHaveBeenCalled();
  });

  it.each([
    [[]],
    [["--force"]],
    [["--check-target"]],
    [["--manual", "--sample-csv"]],
  ])("requires explicit manual mode (%j)", async (args) => {
    await expect(runStagingSeed(args, env, input)).rejects.toThrow("Usage");
    expect(mock.create).not.toHaveBeenCalled();
  });
});
