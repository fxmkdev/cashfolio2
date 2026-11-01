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
export function validatePreviewImage(image: unknown, imageApp: string): string {
  if (!/^[a-z0-9-]+$/.test(imageApp))
    throw new Error("Invalid image repository.");
  const prefix = `registry.fly.io/${imageApp}@sha256:`;
  if (
    typeof image !== "string" ||
    !image.startsWith(prefix) ||
    !/^[a-f0-9]{64}$/.test(image.slice(prefix.length))
  )
    throw new Error(
      "Preview image must be a digest in the configured repository.",
    );
  return image;
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
