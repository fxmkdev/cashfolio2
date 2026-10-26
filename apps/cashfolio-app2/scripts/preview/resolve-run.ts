import { appendFile, readFile } from "node:fs/promises";
import {
  githubApi,
  validateBuild,
  validatePr,
  type BuildRun,
  type PullRequest,
} from "./github.ts";

try {
  const repository = process.env.GITHUB_REPOSITORY!;
  const api = githubApi(repository, process.env.GITHUB_TOKEN!);
  const event = JSON.parse(
    await readFile(process.env.GITHUB_EVENT_PATH!, "utf8"),
  );
  const id: unknown = event.workflow_run?.id;
  if (typeof id !== "number" || !Number.isSafeInteger(id) || id < 1)
    throw new Error("Invalid build run.");
  const run = await api<BuildRun>(`/actions/runs/${id}`);
  const jobs: { name: string; conclusion: string | null }[] = [];
  for (let page = 1; ; page++) {
    const result = await api<{ jobs: typeof jobs }>(
      `/actions/runs/${id}/jobs?filter=latest&per_page=100&page=${page}`,
    );
    jobs.push(...result.jobs);
    if (result.jobs.length < 100) break;
    if (page >= 10) throw new Error("Unexpected build job count.");
  }
  const number = validateBuild(run, repository, jobs);
  const pr = await api<PullRequest>(`/pulls/${number}`);
  validatePr(pr, repository, run.head_sha);
  await appendFile(
    process.env.GITHUB_OUTPUT!,
    `pr_number=${number}\nsha=${run.head_sha}\nrun_id=${id}\n`,
  );
} catch {
  console.error(
    "Preview rejected: the build must contain a successful image job for the current head of an open, same-repository PR.",
  );
  process.exitCode = 1;
}
