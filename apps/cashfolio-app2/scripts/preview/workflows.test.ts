import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
const read = (path: string) =>
  readFileSync(new URL(`../../../../.github/${path}`, import.meta.url), "utf8");
test("PR builds and preview deployment reuse the shared Fly image settings", () => {
  const build = read("workflows/build.yml").replace(/\s+/g, " ");
  const deploy = read("workflows/deploy-preview.yml").replace(/\s+/g, " ");
  const prepare = readFileSync(
    new URL("./prepare.ts", import.meta.url),
    "utf8",
  );
  assert.match(
    build,
    /IMAGE_APP: \$\{\{ vars\.FLY_CASHFOLIO_APP_STAGING_APP \}\}/,
  );
  assert.match(build, /FLY_API_TOKEN: \$\{\{ secrets\.FLY_API_TOKEN \}\}/);
  assert.match(
    build,
    /run: flyctl auth docker env: FLY_API_TOKEN: \$\{\{ secrets\.FLY_API_TOKEN \}\}/,
  );
  assert.match(
    deploy,
    /FLY_CASHFOLIO_APP_STAGING_APP: \$\{\{ vars\.FLY_CASHFOLIO_APP_STAGING_APP \}\}/,
  );
  assert.match(
    prepare,
    /requireValue\(process\.env, "FLY_CASHFOLIO_APP_STAGING_APP"\)/,
  );
  for (const source of [build, deploy, prepare])
    assert.doesNotMatch(source, /FLY_PREVIEW_(IMAGE_APP|BUILD_TOKEN)/);
  assert.match(
    build,
    /github\.event\.pull_request\.head\.repo\.full_name == github\.repository/,
  );
  assert.match(
    build,
    /ref: \$\{\{ github\.event\.pull_request\.head\.sha \|\| github\.sha \}\}/,
  );
  assert.match(
    build,
    /IMAGE_TAG="pr-\$\{PR_SHA\}-\$\{GITHUB_RUN_ID\}-\$\{GITHUB_RUN_ATTEMPT\}"/,
  );
  assert.match(build, /flyctl deploy[\s\S]*--build-only[\s\S]*--push/);
  assert.match(
    build,
    /name: preview-image path: \$\{\{ runner.temp \}\}\/preview-image.json retention-days: 7 overwrite: true/,
  );
});
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
test("trusted deployment reports its required status on the resolved PR commit, including failures", () => {
  const deploy = read("workflows/deploy-preview.yml").replace(/\s+/g, " ");
  assert.match(deploy, /statuses: write/);
  const statusSteps = deploy
    .split("- name:")
    .filter((step) =>
      step.includes("run: node apps/cashfolio-app2/scripts/preview/status.ts"),
    );
  assert.equal(statusSteps.length, 2);
  for (const step of statusSteps)
    assert.match(step, /PR_SHA: \$\{\{ needs\.resolve\.outputs\.sha \}\}/);
  assert.match(statusSteps[0], /PREVIEW_STATUS: pending/);
  assert.match(statusSteps[1], /if: always\(\)/);
  assert.match(statusSteps[1], /PREVIEW_STATUS: \$\{\{ job\.status \}\}/);
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
