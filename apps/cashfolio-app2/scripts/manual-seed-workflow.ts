import { spawn } from "node:child_process";
import { appendFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import {
  parseManualSeedInput,
  SeedSafetyError,
  type ManualSeedInput,
} from "../src/staging-seed/target.ts";

export class SeedWorkflowError extends Error {}
export type ReadJson = (path: string) => Promise<unknown>;

type PullRequest = {
  number: number;
  head: { ref: string; repo: { full_name: string; fork: boolean } | null };
};

type NeonBranch = {
  id: string;
  name: string;
  project_id: string;
  parent_id?: string;
};

export async function resolveSeedTarget(
  ref: string,
  repository: string,
  read: ReadJson,
) {
  if (!ref.startsWith("refs/heads/")) {
    throw new SeedWorkflowError("Select a branch, not a tag.");
  }
  const branch = ref.slice("refs/heads/".length);
  if (branch === "main") return { environment: "staging", prNumber: "" };
  const matches: PullRequest[] = [];
  for (let page = 1; ; page++) {
    const query = new URLSearchParams({
      state: "open",
      head: `${repository.split("/")[0]}:${branch}`,
      per_page: "100",
      page: String(page),
    });
    const prs = (await read(
      `/repos/${repository}/pulls?${query}`,
    )) as PullRequest[];
    if (!Array.isArray(prs))
      throw new SeedWorkflowError("Could not list open pull requests.");
    matches.push(
      ...prs.filter(
        (pr) =>
          pr.head.ref === branch &&
          pr.head.repo?.full_name === repository &&
          !pr.head.repo.fork,
      ),
    );
    if (prs.length < 100) break;
  }
  if (matches.length !== 1) {
    throw new SeedWorkflowError(
      "Select a branch with exactly one open, same-repository pull request.",
    );
  }
  return { environment: "preview", prNumber: String(matches[0].number) };
}

export async function resolveSeedBranch(
  projectId: string,
  stagingBranchId: string,
  previewBranchName: string | undefined,
  read: ReadJson,
): Promise<string> {
  if (
    !/^[a-z0-9-]+$/.test(projectId) ||
    !/^br-[a-z0-9-]+$/.test(stagingBranchId)
  ) {
    throw new SeedWorkflowError(
      "Neon staging project and branch IDs are required.",
    );
  }
  if (!previewBranchName) {
    const result = (await read(
      `/projects/${projectId}/branches/${stagingBranchId}`,
    )) as { branch: NeonBranch };
    if (
      result.branch?.id !== stagingBranchId ||
      result.branch.project_id !== projectId
    ) {
      throw new SeedWorkflowError(
        "Could not verify the existing staging branch.",
      );
    }
    return stagingBranchId;
  }
  const matches = await findPreviewBranches(projectId, previewBranchName, read);
  const branch = matches[0];
  if (
    matches.length !== 1 ||
    !branch ||
    !/^br-[a-z0-9-]+$/.test(branch.id) ||
    branch.id === stagingBranchId ||
    branch.project_id !== projectId ||
    branch.parent_id !== stagingBranchId
  ) {
    throw new SeedWorkflowError(
      "The existing preview Neon branch was not found under staging. Deploy the PR first.",
    );
  }
  return branch.id;
}

async function findPreviewBranches(
  projectId: string,
  previewBranchName: string,
  read: ReadJson,
): Promise<NeonBranch[]> {
  const matches: NeonBranch[] = [];
  let cursor: string | undefined;
  do {
    const query = new URLSearchParams({
      search: previewBranchName,
      limit: "400",
    });
    if (cursor) query.set("cursor", cursor);
    const result = (await read(`/projects/${projectId}/branches?${query}`)) as {
      branches: NeonBranch[];
      pagination?: { next?: string };
    };
    if (!Array.isArray(result.branches))
      throw new SeedWorkflowError("Could not list existing Neon branches.");
    matches.push(
      ...result.branches.filter((branch) => branch.name === previewBranchName),
    );
    cursor = result.pagination?.next;
  } while (cursor);
  return matches;
}

export function seedDeployedApp(
  app: string,
  input: ManualSeedInput,
): Promise<void> {
  if (!app || !/^[a-z0-9-]+$/.test(app))
    throw new SeedWorkflowError("A valid Fly app is required.");
  return new Promise((resolve, reject) => {
    const child = spawn(
      "flyctl",
      [
        "ssh",
        "console",
        "--app",
        app,
        "--process-group",
        "app",
        "--command",
        "node /app/apps/cashfolio-app2/dist/staging-seed/seed.mjs --manual",
      ],
      { stdio: ["pipe", "inherit", "inherit"] },
    );
    child.on("error", () =>
      reject(new SeedWorkflowError("Could not start Fly SSH.")),
    );
    child.stdin.on("error", () =>
      reject(
        new SeedWorkflowError("Could not send manual seed input to Fly SSH."),
      ),
    );
    child.on("close", (code) => {
      if (code === 0) resolve();
      else
        reject(
          new SeedWorkflowError(
            "The deployed seed command failed. Check the seed output and deploy the updated app before retrying.",
          ),
        );
    });
    child.stdin.end(JSON.stringify(input));
  });
}

function required(env: NodeJS.ProcessEnv, key: string) {
  const value = env[key]?.trim();
  if (!value) throw new SeedWorkflowError(`${key} is required.`);
  return value;
}

export function jsonReader(base: string, token: string): ReadJson {
  return async (path) => {
    const response = await fetch(`${base}${path}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok)
      throw new SeedWorkflowError(
        `Read-only API request failed (HTTP ${response.status}).`,
      );
    return response.json();
  };
}

async function writeOutputs(
  env: NodeJS.ProcessEnv,
  values: Record<string, string>,
) {
  await appendFile(
    required(env, "GITHUB_OUTPUT"),
    Object.entries(values)
      .map(([key, value]) => `${key}=${value}\n`)
      .join(""),
  );
}

async function resolveWorkflowTarget(env: NodeJS.ProcessEnv) {
  const target = await resolveSeedTarget(
    required(env, "GITHUB_REF"),
    required(env, "GITHUB_REPOSITORY"),
    jsonReader("https://api.github.com", required(env, "GH_TOKEN")),
  );
  await writeOutputs(env, {
    environment: target.environment,
    pr_number: target.prNumber,
  });
}

async function resolveWorkflowDatabase(env: NodeJS.ProcessEnv) {
  if (
    env.SEED_ENVIRONMENT !== "staging" &&
    env.SEED_ENVIRONMENT !== "preview"
  ) {
    throw new SeedWorkflowError("Invalid seed environment.");
  }
  // Never let a missing preview name silently select the staging branch.
  const previewName =
    env.SEED_ENVIRONMENT === "preview"
      ? required(env, "NEON_BRANCH_NAME")
      : undefined;
  const branchId = await resolveSeedBranch(
    required(env, "NEON_STAGING_PROJECT_ID"),
    required(env, "NEON_STAGING_BRANCH_ID"),
    previewName,
    jsonReader(
      "https://console.neon.tech/api/v2",
      required(env, "NEON_API_KEY"),
    ),
  );
  await writeOutputs(env, { branch_id: branchId });
}

async function seedWorkflowApp(env: NodeJS.ProcessEnv) {
  const input = parseManualSeedInput(
    JSON.stringify({
      projectId: required(env, "NEON_STAGING_PROJECT_ID"),
      branchId: required(env, "NEON_BRANCH_ID"),
      testerExternalIds: required(env, "SEED_USER_EXTERNAL_IDS").split(","),
    }),
  );
  const app = required(env, "FLY_APP");
  const summaryPath = required(env, "GITHUB_STEP_SUMMARY");
  await seedDeployedApp(app, input);
  await appendFile(
    summaryPath,
    `Seeded the deployed version of **${app}** on Neon branch \`${input.branchId}\`. Existing demo data was replaced; old book links are no longer valid.\n`,
  );
}

export async function runSeedWorkflow(
  mode: string | undefined,
  env: NodeJS.ProcessEnv = process.env,
) {
  switch (mode) {
    case "resolve-target":
      return resolveWorkflowTarget(env);
    case "resolve-database":
      return resolveWorkflowDatabase(env);
    case "seed":
      return seedWorkflowApp(env);
    default:
      throw new SeedWorkflowError(
        "Expected resolve-target, resolve-database or seed.",
      );
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  runSeedWorkflow(process.argv[2]).catch((error) => {
    // API/transport errors can contain credentials; only deliberate messages belong in CI logs.
    console.error(
      error instanceof SeedWorkflowError || error instanceof SeedSafetyError
        ? error.message
        : "Manual database seed workflow failed.",
    );
    process.exitCode = 1;
  });
}
