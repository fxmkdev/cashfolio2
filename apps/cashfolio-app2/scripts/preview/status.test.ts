import assert from "node:assert/strict";
import test from "node:test";
import { reportPreviewStatus, PREVIEW_DEPLOYMENT_CONTEXT } from "./status.ts";
import type { githubApi } from "./github.ts";

const env = {
  PR_NUMBER: "42",
  PR_SHA: "a".repeat(40),
  GITHUB_RUN_ID: "123",
  GITHUB_REPOSITORY: "owner/repo",
  PREVIEW_STATUS: "success",
};

test("publishes the existing required context on the resolved PR SHA, never main or a newer head", async () => {
  for (const [outcome, state] of [
    ["pending", "pending"],
    ["success", "success"],
    ["failure", "failure"],
    ["cancelled", "failure"],
  ]) {
    const calls: unknown[][] = [];
    const request = (async (...args: unknown[]) => {
      calls.push(args);
    }) as ReturnType<typeof githubApi>;
    await reportPreviewStatus(
      { ...env, GITHUB_SHA: "b".repeat(40), PREVIEW_STATUS: outcome },
      request,
    );
    assert.equal(calls.length, 1);
    const [path, options] = calls[0] as [
      string,
      { method: string; body: Record<string, unknown> },
    ];
    assert.equal(path, `/statuses/${env.PR_SHA}`);
    assert.equal(options.method, "POST");
    assert.equal(options.body.context, PREVIEW_DEPLOYMENT_CONTEXT);
    assert.equal(
      PREVIEW_DEPLOYMENT_CONTEXT,
      "Deploy to preview / cashfolio-app2: Deploy",
    );
    assert.equal(options.body.state, state);
    assert.equal(
      options.body.target_url,
      "https://github.com/owner/repo/actions/runs/123",
    );
  }
});

test("rejects invalid SHA, PR, run and status before any status write", async () => {
  for (const changed of [
    { PR_SHA: "main" },
    { PR_SHA: env.PR_SHA + "\nINJECT=true" },
    { PR_NUMBER: "-1" },
    { GITHUB_RUN_ID: "NaN" },
    { GITHUB_RUN_ID: "0" },
    { PREVIEW_STATUS: "skipped" },
  ]) {
    let calls = 0;
    const request = (async () => {
      calls++;
    }) as ReturnType<typeof githubApi>;
    await assert.rejects(reportPreviewStatus({ ...env, ...changed }, request));
    assert.equal(calls, 0);
  }
});

test("propagates publication failures instead of silently leaving a successful deployment check", async () => {
  const request = (async () => {
    throw new Error("GitHub unavailable");
  }) as ReturnType<typeof githubApi>;
  await assert.rejects(reportPreviewStatus(env, request), /GitHub unavailable/);
});
