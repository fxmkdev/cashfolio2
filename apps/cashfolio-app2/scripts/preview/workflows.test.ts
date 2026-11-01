import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
const read = (path: string) =>
  readFileSync(new URL(`../../../../.github/${path}`, import.meta.url), "utf8");
const build = read("workflows/build.yml");
const preview = build.slice(
  build.indexOf("  preview-deploy:"),
  build.indexOf("\n  deploy:"),
);

test("PR builds use Fly/Depot and pass the shared repository digest directly to deployment", () => {
  assert.match(
    build,
    /IMAGE_APP: \$\{\{ vars\.FLY_CASHFOLIO_APP_STAGING_APP \}\}/,
  );
  assert.match(build, /FLY_API_TOKEN: \$\{\{ secrets\.FLY_API_TOKEN \}\}/);
  assert.match(build, /run: flyctl auth docker/);
  assert.match(
    build,
    /ref: \$\{\{ github.event.pull_request.head.sha \|\| github.sha \}\}/,
  );
  assert.match(
    build,
    /IMAGE_TAG="pr-\$\{PR_SHA\}-\$\{GITHUB_RUN_ID\}-\$\{GITHUB_RUN_ATTEMPT\}"/,
  );
  assert.match(build, /flyctl deploy[\s\S]*--build-only[\s\S]*--push/);
  assert.match(
    build,
    /preview_image: \$\{\{ steps\.preview-image\.outputs\.image \}\}/,
  );
  assert.match(
    preview,
    /PREVIEW_IMAGE:\s+\$\{\{ needs\.cashfolio-app2-build-push\.outputs\.preview_image \}\}/,
  );
  const resolver = readFileSync(
    new URL("./resolve-image.ts", import.meta.url),
    "utf8",
  );
  assert.match(resolver, /requireValue\(process.env, "GITHUB_OUTPUT"\)/);
  assert.match(resolver, /`image=\$\{image\}\\n`/);
  assert.doesNotMatch(
    build,
    /preview-image\.json|name: preview-image\s+path:|workflow_run|statuses: write/,
  );
  assert.doesNotMatch(build, /FLY_PREVIEW_(IMAGE_APP|BUILD_TOKEN)/);
  assert.equal(
    existsSync(
      new URL(
        "../../../../.github/workflows/deploy-preview.yml",
        import.meta.url,
      ),
    ),
    false,
  );
});

test("preview deployment requires a successful build and excludes forks and non-PR events", () => {
  assert.match(preview, /name: "Deploy to preview \/ cashfolio-app2: Deploy"/);
  assert.match(preview, /needs: cashfolio-app2-build-push/);
  assert.match(preview, /github.event_name == 'pull_request'/);
  assert.match(
    preview,
    /github.event.pull_request.head.repo.full_name == github.repository/,
  );
  assert.match(preview, /github.event.pull_request.head.repo.fork == false/);
  assert.match(preview, /ref: \$\{\{ github.event.pull_request.head.sha \}\}/);
  assert.match(
    preview,
    /PR_SHA: \$\{\{ github.event.pull_request.head.sha \}\}/,
  );
  // Normal steps must stop on failure; only the outcome summary runs unconditionally.
  assert.equal((preview.match(/if: always\(\)/g) ?? []).length, 1);
  assert.match(preview, /name: Deployment summary\s+if: always\(\)/);
  assert.doesNotMatch(
    preview,
    /continue-on-error|!cancelled\(\)|always\(\).*needs:/,
  );
  const steps = [
    "Provision database",
    "Deploy and seed preview",
    "Wake preview",
    "Update preview link",
    "Deployment summary",
  ];
  for (let index = 1; index < steps.length; index++)
    assert.ok(
      preview.indexOf(steps[index - 1]) < preview.indexOf(steps[index]),
    );
});

test("deployment and main-branch cleanup share the existing environment and serialize per PR", () => {
  const cleanup = read("workflows/cleanup-preview.yml");
  for (const source of [preview, cleanup]) {
    assert.match(
      source,
      /group: cashfolio-app2-preview-pr-\$\{\{ github.event.pull_request.number \}\}/,
    );
    assert.match(source, /cancel-in-progress: false/);
    assert.match(source, /preview-cashfolio-app/);
    assert.match(source, /persist-credentials: false/);
    assert.doesNotMatch(
      source,
      /preview-cashfolio-provision|neondatabase\/|NEON_API_KEY/,
    );
  }
  assert.match(cleanup, /pull_request_target:/);
  assert.match(cleanup, /ref: main/);
});

test("ordinary staging and preview releases seed, while production stays migration-only", () => {
  const shared = read("workflows/deploy-version.yml").replace(/\s+/g, " ");
  assert.match(
    shared,
    /inputs.environment == 'prod'.*prisma-migrate-deploy-with-retry.sh.*seed.mjs --release/,
  );
  assert.doesNotMatch(shared, /STAGING_SEED_ENABLED|create-branch|neon_branch/);
  assert.match(
    preview.replace(/\s+/g, " "),
    /release_command: node .*seed.mjs --release/,
  );
});
