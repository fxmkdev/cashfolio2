import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import test from "node:test";

const execute = promisify(execFile);
const sha = "a".repeat(40);
const pr = {
  number: 42,
  state: "open",
  title: "Preview",
  head: { sha, ref: "topic", repo: { full_name: "owner/repo", fork: false } },
  base: { repo: { full_name: "owner/repo" } },
};

test("invalid PRs or direct image inputs stop preparation before provisioning or publishing outputs", async () => {
  const directory = await mkdtemp(join(tmpdir(), "preview-prepare-"));
  const output = join(directory, "output");
  const image = `registry.fly.io/cashfolio-staging@sha256:${"b".repeat(64)}`;
  try {
    for (const changed of [
      { pr: { ...pr, state: "closed" }, image, sha },
      { pr, image, sha: "c".repeat(40) },
      { pr, image, sha: "" },
      {
        pr: {
          ...pr,
          head: { ...pr.head, repo: { full_name: "fork/repo", fork: true } },
        },
        image,
        sha,
      },
      { pr, image: image.replace("cashfolio-staging", "other-app"), sha },
      { pr, image: "registry.fly.io/cashfolio-staging:latest", sha },
      { pr, image: "", sha },
    ]) {
      // The only permitted network request is the PR lookup. No real database,
      // provider, or GitHub connection is available to this child process.
      const preload = `globalThis.fetch = async (url) => {
        if (url !== "https://api.github.com/repos/owner/repo/pulls/42")
          throw new Error("Unexpected network request");
        return new Response(${JSON.stringify(JSON.stringify(changed.pr))});
      };`;
      await assert.rejects(
        execute(
          process.execPath,
          [
            "--import",
            `data:text/javascript,${encodeURIComponent(preload)}`,
            new URL("./prepare.ts", import.meta.url).pathname,
          ],
          {
            env: {
              PATH: process.env.PATH,
              GITHUB_REPOSITORY: "owner/repo",
              GITHUB_TOKEN: "test-token",
              GITHUB_OUTPUT: output,
              PR_NUMBER: "42",
              PR_SHA: changed.sha,
              PREVIEW_IMAGE: changed.image,
              FLY_CASHFOLIO_APP_STAGING_APP: "cashfolio-staging",
            },
            timeout: 10_000,
          },
        ),
        (error: unknown) => {
          const failure = error as { code: number; stderr: string };
          assert.equal(failure.code, 1);
          assert.match(failure.stderr, /failed during input validation/);
          assert.doesNotMatch(failure.stderr, /test-token|postgresql:\/\//);
          return true;
        },
      );
      await assert.rejects(readFile(output), { code: "ENOENT" });
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
