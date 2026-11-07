import { spawn, spawnSync } from "node:child_process";
import { EventEmitter } from "node:events";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { runSeedWorkflow } from "../../scripts/manual-seed-workflow";

vi.mock("node:child_process", async (importOriginal) => ({
  ...(await importOriginal<typeof import("node:child_process")>()),
  spawn: vi.fn(),
}));

let directory: string;
let env: NodeJS.ProcessEnv;
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "manual-seed-workflow-"));
  env = {
    GITHUB_REF: "refs/heads/main",
    GITHUB_REPOSITORY: "owner/cashfolio2",
    GITHUB_OUTPUT: join(directory, "outputs"),
    GITHUB_STEP_SUMMARY: join(directory, "summary"),
    GH_TOKEN: "sensitive-github-token",
    NEON_API_KEY: "sensitive-neon-token",
    NEON_STAGING_PROJECT_ID: "test-project",
    NEON_STAGING_BRANCH_ID: "br-staging",
    SEED_ENVIRONMENT: "staging",
    SEED_USER_EXTERNAL_IDS: " tester,admin,tester ",
    FLY_APP: "preview-app",
  };
  await Promise.all([
    writeFile(env.GITHUB_OUTPUT!, ""),
    writeFile(env.GITHUB_STEP_SUMMARY!, ""),
  ]);
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(async () => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  await rm(directory, { recursive: true, force: true });
});

it("routes main without GitHub requests and verifies its configured Neon branch", async () => {
  await runSeedWorkflow("resolve-target", env);
  expect(fetchMock).not.toHaveBeenCalled();
  fetchMock.mockResolvedValue(
    new Response(
      JSON.stringify({
        branch: { id: "br-staging", project_id: "test-project" },
      }),
    ),
  );
  await runSeedWorkflow("resolve-database", env);
  expect(await readFile(env.GITHUB_OUTPUT!, "utf8")).toBe(
    "environment=staging\npr_number=\nbranch_id=br-staging\n",
  );
  expect(fetchMock.mock.calls[0][0]).toBe(
    "https://console.neon.tech/api/v2/projects/test-project/branches/br-staging",
  );
  expect(spawn).not.toHaveBeenCalled();
});

it("passes the resolved preview branch and deduplicated tester IDs to the deployed command", async () => {
  env.GITHUB_REF = "refs/heads/codex/demo";
  env.SEED_ENVIRONMENT = "preview";
  env.NEON_BRANCH_NAME = "pr-42-demo-cashfolio-app2";
  fetchMock
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify([
          {
            number: 42,
            head: {
              ref: "codex/demo",
              repo: { full_name: "owner/cashfolio2", fork: false },
            },
          },
        ]),
      ),
    )
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          branches: [
            {
              id: "br-preview",
              name: env.NEON_BRANCH_NAME,
              project_id: "test-project",
              parent_id: "br-staging",
            },
          ],
        }),
      ),
    );
  await runSeedWorkflow("resolve-target", env);
  await runSeedWorkflow("resolve-database", env);
  const output = await readFile(env.GITHUB_OUTPUT!, "utf8");
  expect(output).toBe(
    "environment=preview\npr_number=42\nbranch_id=br-preview\n",
  );
  const outputs = Object.fromEntries(
    output
      .trim()
      .split("\n")
      .map((line) => line.split("=")),
  );
  env.NEON_BRANCH_ID = outputs.branch_id;
  const child = Object.assign(new EventEmitter(), { stdin: new PassThrough() });
  vi.mocked(spawn).mockReturnValue(
    child as unknown as ReturnType<typeof spawn>,
  );
  const seed = runSeedWorkflow("seed", env);
  child.emit("close", 0);
  await seed;
  expect(JSON.parse(child.stdin.read().toString())).toEqual({
    projectId: "test-project",
    branchId: "br-preview",
    testerExternalIds: ["tester", "admin"],
  });
  const summary = await readFile(env.GITHUB_STEP_SUMMARY!, "utf8");
  expect(summary).toContain("preview-app");
  expect(summary).toContain("br-preview");
  expect(summary).not.toContain("tester");
  expect(summary).not.toContain("sensitive");
});

it.each([undefined, "", " "])(
  "rejects missing preview name %j before any API request",
  async (name) => {
    await expect(
      runSeedWorkflow("resolve-database", {
        ...env,
        SEED_ENVIRONMENT: "preview",
        NEON_BRANCH_NAME: name,
      }),
    ).rejects.toThrow("NEON_BRANCH_NAME is required");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(spawn).not.toHaveBeenCalled();
  },
);

it.each([undefined, "prod", "production"])(
  "rejects invalid seed environment %j before any API request",
  async (environment) => {
    await expect(
      runSeedWorkflow("resolve-database", {
        ...env,
        SEED_ENVIRONMENT: environment,
      }),
    ).rejects.toThrow("Invalid seed environment");
    expect(fetchMock).not.toHaveBeenCalled();
  },
);

it("does not invoke SSH when the branch lookup fails", async () => {
  fetchMock.mockResolvedValue(
    new Response("sensitive provider response", { status: 403 }),
  );
  await expect(runSeedWorkflow("resolve-database", env)).rejects.toThrow(
    "Read-only API request failed (HTTP 403)",
  );
  expect(spawn).not.toHaveBeenCalled();
  expect(await readFile(env.GITHUB_OUTPUT!, "utf8")).toBe("");
});

it.each(["", "tester,", "tester\nadmin"])(
  "rejects invalid tester configuration %j before SSH",
  async (testers) => {
    await expect(
      runSeedWorkflow("seed", {
        ...env,
        NEON_BRANCH_ID: "br-preview",
        SEED_USER_EXTERNAL_IDS: testers,
      }),
    ).rejects.toThrow();
    expect(spawn).not.toHaveBeenCalled();
    expect(await readFile(env.GITHUB_STEP_SUMMARY!, "utf8")).toBe("");
  },
);

it("validates the summary destination before starting a destructive command", async () => {
  await expect(
    runSeedWorkflow("seed", {
      ...env,
      NEON_BRANCH_ID: "br-preview",
      GITHUB_STEP_SUMMARY: undefined,
    }),
  ).rejects.toThrow("GITHUB_STEP_SUMMARY is required");
  expect(spawn).not.toHaveBeenCalled();
});

it("does not report success when SSH fails", async () => {
  const child = Object.assign(new EventEmitter(), { stdin: new PassThrough() });
  vi.mocked(spawn).mockReturnValue(
    child as unknown as ReturnType<typeof spawn>,
  );
  const seed = runSeedWorkflow("seed", {
    ...env,
    NEON_BRANCH_ID: "br-preview",
  });
  child.emit("close", 1);
  await expect(seed).rejects.toThrow("deployed seed command failed");
  expect(await readFile(env.GITHUB_STEP_SUMMARY!, "utf8")).toBe("");
});

it("shows deliberate input validation errors from the native Node entry point without disclosing inputs", () => {
  const script = fileURLToPath(
    new URL("../../scripts/manual-seed-workflow.ts", import.meta.url),
  );
  const result = spawnSync(process.execPath, [script, "seed"], {
    env: {
      ...process.env,
      ...env,
      NEON_BRANCH_ID: "br-preview",
      SEED_USER_EXTERNAL_IDS: "sensitive-tester,",
      FLY_API_TOKEN: "",
    },
    encoding: "utf8",
    timeout: 5_000,
  });
  expect(result.status).toBe(1);
  expect(result.stderr).toContain(
    "Manual seed input requires projectId, branchId and nonempty testerExternalIds.",
  );
  expect(result.stderr).not.toContain("sensitive");
});

it.each([undefined, "unknown"])(
  "rejects unknown mode %j without provider calls",
  async (mode) => {
    await expect(runSeedWorkflow(mode, env)).rejects.toThrow(
      "Expected resolve-target, resolve-database or seed",
    );
    expect(fetchMock).not.toHaveBeenCalled();
    expect(spawn).not.toHaveBeenCalled();
  },
);
