import { readFile } from "node:fs/promises";
import { cleanupDatabase } from "./database.ts";
import { githubApi, validatePr, type PullRequest } from "./github.ts";
import { command, verifiedProvisioner } from "./runtime.ts";
import { previewNames } from "./names.ts";

try {
  const event = JSON.parse(
    await readFile(process.env.GITHUB_EVENT_PATH!, "utf8"),
  );
  const api = githubApi(
    process.env.GITHUB_REPOSITORY!,
    process.env.GITHUB_TOKEN!,
  );
  const number: unknown = event.pull_request?.number;
  if (typeof number !== "number" || !Number.isSafeInteger(number) || number < 1)
    throw new Error("Invalid PR number.");
  const pr = await api<PullRequest>(`/pulls/${number}`);
  validatePr(pr, process.env.GITHUB_REPOSITORY!, undefined, true);
  const names = previewNames(number, pr.head.ref, pr.title);
  const { client } = await verifiedProvisioner();
  try {
    const apps = JSON.parse(await command(["apps", "list", "--json"])) as {
      Name: string;
      name?: string;
    }[];
    for (const name of [names.flyApp, names.flyAppLegacy])
      if (apps.some((app) => (app.Name ?? app.name) === name))
        await command(["apps", "destroy", name, "--yes"]);
    await cleanupDatabase(client, number);
  } finally {
    await client.end();
  }
  console.log(`Preview resources removed for PR #${number}.`);
} catch {
  console.error(
    "Preview cleanup failed; inspect the preview app, database and roles with operator access.",
  );
  process.exitCode = 1;
}
