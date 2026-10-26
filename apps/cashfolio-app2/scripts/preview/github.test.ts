import assert from "node:assert/strict";
import test from "node:test";
import {
  validateBuild,
  validateManifest,
  validatePr,
  type BuildRun,
  type PullRequest,
} from "./github.ts";
const repository = "owner/repo";
const sha = "a".repeat(40);
const pr: PullRequest = {
  number: 42,
  state: "open",
  title: "Test",
  head: { sha, ref: "topic", repo: { full_name: repository, fork: false } },
  base: { repo: { full_name: repository } },
};
const run: BuildRun = {
  id: 12,
  event: "pull_request",
  path: ".github/workflows/build.yml",
  head_sha: sha,
  repository: { full_name: repository },
  head_repository: { full_name: repository },
  pull_requests: [{ number: 42 }],
};
const jobs = [
  { name: "cashfolio-app2: Build and Push", conclusion: "success" },
];

test("requires an open same-repository PR at the exact built commit", () => {
  assert.doesNotThrow(() => validatePr(pr, repository, sha));
  for (const changed of [
    { ...pr, state: "closed" },
    { ...pr, head: { ...pr.head, sha: "b".repeat(40) } },
    { ...pr, head: { ...pr.head, repo: null } },
    {
      ...pr,
      head: { ...pr.head, repo: { full_name: "fork/repo", fork: true } },
    },
    { ...pr, base: { repo: { full_name: "other/repo" } } },
  ])
    assert.throws(() => validatePr(changed, repository, sha));
  assert.doesNotThrow(() =>
    validatePr({ ...pr, state: "closed" }, repository, undefined, true),
  );
  assert.throws(() => validatePr(pr, repository, undefined, true));
});
test("validates build provenance and the image job rather than trusting artifact claims", () => {
  assert.equal(validateBuild(run, repository, jobs), 42);
  for (const changed of [
    { ...run, event: "workflow_dispatch" },
    { ...run, path: ".github/workflows/evil.yml" },
    { ...run, head_repository: { full_name: "fork/repo" } },
    { ...run, pull_requests: [] },
    { ...run, pull_requests: [{ number: 42 }, { number: 43 }] },
  ])
    assert.throws(() => validateBuild(changed, repository, jobs));
  for (const conclusion of ["failure", "cancelled", "skipped", null])
    assert.throws(() =>
      validateBuild(run, repository, [{ ...jobs[0], conclusion }]),
    );
  assert.throws(() => validateBuild(run, repository, [...jobs, ...jobs]));
});
test("accepts only a digest in the dedicated preview repository for the expected PR and SHA", () => {
  const image = "registry.fly.io/preview-images@sha256:" + "b".repeat(64);
  const manifest = { pr: 42, sha, image };
  assert.equal(validateManifest(manifest, 42, sha, "preview-images"), image);
  for (const value of [
    null,
    { ...manifest, pr: 43 },
    { ...manifest, sha: "b".repeat(40) },
    { ...manifest, image: image.replace("preview-images", "production") },
    { ...manifest, image: "registry.fly.io/preview-images:latest" },
    { ...manifest, image: image + "\nINJECT=true" },
  ])
    assert.throws(() => validateManifest(value, 42, sha, "preview-images"));
});
