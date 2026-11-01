import assert from "node:assert/strict";
import test from "node:test";
import {
  validatePreviewImage,
  validatePr,
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
test("accepts only an immutable digest in the shared image repository", () => {
  const imageApp = "cashfolio-staging";
  const image = `registry.fly.io/${imageApp}@sha256:` + "b".repeat(64);
  assert.equal(validatePreviewImage(image, imageApp), image);
  for (const value of [
    null,
    image.replace(imageApp, "other-app"),
    `registry.fly.io/${imageApp}:latest`,
    image + "\nINJECT=true",
    image.slice(0, -1),
  ])
    assert.throws(() => validatePreviewImage(value, imageApp));
  assert.throws(() => validatePreviewImage(image, "bad/repository"));
});
