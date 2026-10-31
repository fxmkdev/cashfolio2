import { prNumber } from "./names.ts";

export interface PullRequest {
  number: number;
  state: string;
  title: string;
  head: {
    sha: string;
    ref: string;
    repo: { full_name: string; fork: boolean } | null;
  };
  base: { repo: { full_name: string } };
}
export interface BuildRun {
  id: number;
  event: string;
  path: string;
  head_sha: string;
  repository: { full_name: string };
  head_repository: { full_name: string };
  pull_requests: { number: number }[];
}
export function validatePr(
  pr: PullRequest,
  repository: string,
  sha?: string,
  closed = false,
) {
  prNumber(pr.number);
  if (
    pr.state !== (closed ? "closed" : "open") ||
    pr.head.repo?.full_name !== repository ||
    pr.head.repo.fork ||
    pr.base.repo.full_name !== repository
  )
    throw new Error(
      "Only same-repository PRs in the required state are permitted.",
    );
  if (!/^[a-f0-9]{40}$/.test(pr.head.sha) || (sha && pr.head.sha !== sha))
    throw new Error("The build no longer identifies the current PR head.");
}
export function validateBuild(
  run: BuildRun,
  repository: string,
  jobs: { name: string; conclusion: string | null }[],
) {
  if (
    run.event !== "pull_request" ||
    run.path !== ".github/workflows/build.yml" ||
    run.repository.full_name !== repository ||
    run.head_repository.full_name !== repository ||
    !/^[a-f0-9]{40}$/.test(run.head_sha) ||
    run.pull_requests.length !== 1
  )
    throw new Error("The triggering run is not a same-repository PR build.");
  const imageJobs = jobs.filter(
    ({ name }) => name === "cashfolio-app2: Build and Push",
  );
  if (imageJobs.length !== 1 || imageJobs[0].conclusion !== "success")
    throw new Error("The preview image build did not succeed.");
  return prNumber(run.pull_requests[0].number);
}
export function validateManifest(
  value: unknown,
  number: number,
  sha: string,
  imageApp: string,
): string {
  if (!/^[a-z0-9-]+$/.test(imageApp) || !value || typeof value !== "object")
    throw new Error("Invalid image metadata.");
  const metadata = value as Record<string, unknown>;
  const prefix = `registry.fly.io/${imageApp}@sha256:`;
  if (
    metadata.pr !== number ||
    metadata.sha !== sha ||
    typeof metadata.image !== "string" ||
    !metadata.image.startsWith(prefix) ||
    !/^[a-f0-9]{64}$/.test(metadata.image.slice(prefix.length))
  )
    throw new Error(
      "Image metadata does not identify this PR, commit and configured image repository.",
    );
  return metadata.image;
}
export function githubApi(repository: string, token: string) {
  if (!/^[\w.-]+\/[\w.-]+$/.test(repository) || !token)
    throw new Error("GitHub configuration is required.");
  return async function request<T>(
    path: string,
    options?: { method: "POST" | "PATCH"; body: Record<string, unknown> },
  ): Promise<T> {
    const response = await fetch(
      `https://api.github.com/repos/${repository}${path}`,
      {
        method: options?.method ?? "GET",
        body: options ? JSON.stringify(options.body) : undefined,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
        },
        signal: AbortSignal.timeout(30_000),
      },
    );
    if (!response.ok)
      throw new Error(`GitHub lookup failed (${response.status}).`);
    return (await response.json()) as T;
  };
}
