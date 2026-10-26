import { githubApi, validatePr, type PullRequest } from "./github.ts";
import { prNumber } from "./names.ts";

async function publish() {
  const number = prNumber(Number(process.env.PR_NUMBER));
  const repository = process.env.GITHUB_REPOSITORY!;
  const api = githubApi(repository, process.env.GITHUB_TOKEN!);
  const pr = await api<PullRequest>(`/pulls/${number}`);
  // A newer build/close may have arrived while Fly was finishing the release.
  if (pr.state !== "open" || pr.head.sha !== process.env.PR_SHA) return;
  validatePr(pr, repository, process.env.PR_SHA);
  const url = process.env.PREVIEW_URL ?? "";
  if (
    !new RegExp(
      `^https://cashfolio-app2-pr-${number}-[a-z0-9-]+\\.fly\\.dev/$`,
    ).test(url)
  )
    throw new Error("Invalid preview URL.");
  const marker = "<!-- cashfolio-app2-dynamic-preview -->";
  const body = [
    marker,
    "Dynamic preview deployed and seeded",
    "",
    `- URL: ${url}`,
    `- Database: \`${process.env.PREVIEW_DATABASE}\``,
    `- Commit: \`${pr.head.sha}\``,
  ].join("\n");
  for (let page = 1; page <= 10; page++) {
    const comments = await api<
      { id: number; body: string; user: { type: string } }[]
    >(`/issues/${number}/comments?per_page=100&page=${page}`);
    const existing = comments.find(
      (comment) => comment.user.type === "Bot" && comment.body.includes(marker),
    );
    if (existing) {
      await api(`/issues/comments/${existing.id}`, {
        method: "PATCH",
        body: { body },
      });
      return;
    }
    if (comments.length < 100) {
      await api(`/issues/${number}/comments`, {
        method: "POST",
        body: { body },
      });
      return;
    }
  }
  throw new Error("Too many comments to locate the existing preview link.");
}
try {
  await publish();
} catch {
  console.error(
    "Could not update the preview PR link; inspect the deployment summary for its outcome.",
  );
  process.exitCode = 1;
}
