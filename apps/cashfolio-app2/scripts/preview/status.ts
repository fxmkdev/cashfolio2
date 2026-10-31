import { pathToFileURL } from "node:url";
import { githubApi } from "./github.ts";
import { prNumber } from "./names.ts";
import { requireValue } from "../../src/staging-seed/target.ts";

// Preserve the context required by the repository's existing branch rules.
export const PREVIEW_DEPLOYMENT_CONTEXT =
  "Deploy to preview / cashfolio-app2: Deploy";

export async function reportPreviewStatus(
  env: NodeJS.ProcessEnv,
  request?: ReturnType<typeof githubApi>,
) {
  const number = prNumber(Number(requireValue(env, "PR_NUMBER")));
  const sha = requireValue(env, "PR_SHA");
  const runId = Number(requireValue(env, "GITHUB_RUN_ID"));
  const outcome = requireValue(env, "PREVIEW_STATUS");
  if (
    !/^[a-f0-9]{40}$/.test(sha) ||
    !Number.isSafeInteger(runId) ||
    runId < 1 ||
    !["pending", "success", "failure", "cancelled"].includes(outcome)
  )
    throw new Error("Invalid preview status identity or outcome.");
  const repository = requireValue(env, "GITHUB_REPOSITORY");
  const api =
    request ?? githubApi(repository, requireValue(env, "GITHUB_TOKEN"));
  const descriptions = {
    pending: "deployment and seeding in progress",
    success: "deployed and seeded",
    failure: "deployment or seeding failed",
    cancelled: "deployment cancelled",
  };
  await api(`/statuses/${sha}`, {
    method: "POST",
    body: {
      context: PREVIEW_DEPLOYMENT_CONTEXT,
      state: outcome === "cancelled" ? "failure" : outcome,
      description: `PR #${number} preview ${descriptions[outcome as keyof typeof descriptions]}.`,
      target_url: `https://github.com/${repository}/actions/runs/${runId}`,
    },
  });
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    await reportPreviewStatus(process.env);
  } catch {
    console.error(
      "Could not report preview deployment status on the verified PR commit.",
    );
    process.exitCode = 1;
  }
}
