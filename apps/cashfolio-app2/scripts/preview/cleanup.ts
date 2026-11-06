import { appendFile } from "node:fs/promises";
import { Neon } from "../nonproduction/neon.ts";
import { openPullRequests, sweep } from "../nonproduction/cleanup.ts";
import { flyInventory, healthyPreview } from "../nonproduction/fly.ts";
import { githubApi } from "./github.ts";
import { command } from "./runtime.ts";
import { requireValue } from "../../src/staging-seed/target.ts";

try {
  const repository = requireValue(process.env, "GITHUB_REPOSITORY");
  const api = githubApi(repository, requireValue(process.env, "GITHUB_TOKEN"));
  const repo = await api<{ default_branch: string }>("");
  if (typeof repo.default_branch !== "string" || !repo.default_branch)
    throw new Error("Missing default Git branch.");
  const prs = await openPullRequests(api, repository);
  const neon = new Neon(process.env);
  const stagingApp = requireValue(process.env, "FLY_CASHFOLIO_APP_STAGING_APP");
  requireValue(process.env, "FLY_API_TOKEN");
  const result = await sweep({
    prs,
    defaultBranch: repo.default_branch,
    now: Date.now(),
    neon,
    inventory: () => flyInventory(stagingApp),
    retire: (name) => command(["apps", "destroy", name, "--yes"]),
    healthy: healthyPreview,
  });
  const summary = `Retired ${result.apps} preview apps and ${result.databases} unused databases.`;
  console.log(summary);
  if (process.env.GITHUB_STEP_SUMMARY)
    await appendFile(
      process.env.GITHUB_STEP_SUMMARY,
      `### Nonproduction cleanup\n${summary}\n`,
    );
} catch {
  console.error(
    "Nonproduction cleanup failed; no database deletion is attempted with incomplete inventories. Raw provider diagnostics are suppressed.",
  );
  process.exitCode = 1;
}
