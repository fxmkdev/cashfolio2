import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
const read = (path: string) =>
  readFileSync(new URL(`../../../../.github/${path}`, import.meta.url), "utf8");
test("deploy and cleanup share noncancelling per-PR concurrency and protected environment", () => {
  const deploy = read("workflows/deploy-preview.yml");
  const cleanup = read("workflows/cleanup-preview.yml");
  for (const source of [deploy, cleanup]) {
    assert.match(source, /group: cashfolio-app2-preview-pr-/);
    assert.match(source, /cancel-in-progress: false/);
    assert.match(source, /preview-cashfolio-provision/);
    assert.match(source, /persist-credentials: false/);
    assert.doesNotMatch(source, /ref:.*head\.sha|neondatabase\/|NEON_API_KEY/);
  }
  assert.match(deploy, /workflow_run:/);
  assert.match(cleanup, /pull_request_target:/);
});
test("ordinary staging and preview releases seed, while production stays migration-only", () => {
  const shared = read("workflows/deploy-version.yml").replace(/\s+/g, " ");
  assert.match(
    shared,
    /inputs.environment == 'prod'.*prisma-migrate-deploy-with-retry.sh.*seed.mjs --release/,
  );
  assert.doesNotMatch(shared, /STAGING_SEED_ENABLED|create-branch|neon_branch/);
  assert.match(
    read("workflows/deploy-preview.yml").replace(/\s+/g, " "),
    /release_command: node .*seed.mjs --release/,
  );
});
