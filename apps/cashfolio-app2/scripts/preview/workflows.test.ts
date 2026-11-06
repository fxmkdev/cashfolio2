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
const deploy = read("workflows/deploy-version.yml");
const cleanup = read("workflows/cleanup-preview.yml");

test("PR builds stay on Fly/Depot and deploy their exact immutable image after a successful build", () => {
  assert.match(build, /FLY_CASHFOLIO_APP_STAGING_APP/);
  assert.match(build, /flyctl deploy[\s\S]*--build-only[\s\S]*--push/);
  assert.match(
    build,
    /ref: \$\{\{ github.event.pull_request.head.sha \|\| github.sha \}\}/,
  );
  assert.match(
    build,
    /pr-\$\{PR_SHA\}-\$\{GITHUB_RUN_ID\}-\$\{GITHUB_RUN_ATTEMPT\}/,
  );
  assert.match(preview, /needs: cashfolio-app2-build-push/);
  assert.match(preview, /name: "Deploy to preview \/ cashfolio-app2: Deploy"/);
  assert.match(preview, /github.event_name == 'pull_request'/);
  assert.match(preview, /head.repo.full_name == github.repository/);
  assert.match(preview, /head.repo.fork == false/);
  assert.match(
    preview,
    /image: \$\{\{ needs.cashfolio-app2-build-push.outputs.preview_image \}\}/,
  );
  assert.equal((preview.match(/if: always\(\)/g) ?? []).length, 1);
  assert.match(preview, /name: Deployment summary\s+if: always\(\)/);
  assert.doesNotMatch(preview, /continue-on-error/);
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
test("staging, preview and cleanup share one noncancelling queue with no caller lock", () => {
  for (const source of [preview, deploy, cleanup]) {
    assert.match(source, /cashfolio-app2-nonproduction/);
    assert.match(source, /cancel-in-progress: false/);
  }
  assert.doesNotMatch(
    build.slice(build.indexOf("\n  deploy:"), build.indexOf("\n  release:")),
    /concurrency:/,
  );
  assert.match(cleanup, /cron: "30 4 \* \* \*"/);
  assert.match(cleanup, /workflow_dispatch:/);
  assert.match(cleanup, /pull_request_target:/);
  assert.match(cleanup, /ref: main/);
});
test("both deployment paths use Neon API settings and expose only nonsecret database metadata to Machines", () => {
  for (const source of [preview, deploy, cleanup]) {
    assert.match(source, /NEON_API_KEY: \$\{\{ secrets.NEON_API_KEY \}\}/);
    assert.match(source, /NEON_PROJECT_ID: \$\{\{ vars.NEON_PROJECT_ID \}\}/);
    assert.doesNotMatch(
      source,
      /PREVIEW_DATABASE_ADMIN_URL|PREVIEW_DATABASE_TARGET|NEON_STAGING_BRANCH_ID|PREVIEW_DATABASE_PASSWORD_KEY/,
    );
  }
  assert.match(deploy, /if: inputs.environment == 'staging'/);
  assert.match(deploy, /scripts\/nonproduction\/stage.ts/);
  assert.match(
    deploy.replace(/\s+/g, " "),
    /github.ref_type == 'branch' && github.ref_name \|\| github.event.repository.default_branch/,
  );
  for (const source of [preview, deploy])
    for (const field of [
      "database_project_id",
      "database_branch_id",
      "database_name",
      "deploy_sha",
    ])
      assert.ok(source.includes(`${field}:`));
  const template = readFileSync(
    new URL("../../fly.template.toml", import.meta.url),
    "utf8",
  );
  assert.match(template, /CASHFOLIO_DATABASE_NAME/);
  assert.doesNotMatch(template, /NEON_API_KEY/);
});
test("production remains migration-only and daily refresh uses the same staging provisioning flow", () => {
  assert.match(
    deploy.replace(/\s+/g, " "),
    /inputs.environment == 'prod'.*prisma-migrate-deploy-with-retry.sh.*seed.mjs --release/,
  );
  const refresh = read("workflows/refresh-staging-db.yml");
  assert.match(refresh, /uses: .\/.github\/workflows\/deploy-version.yml/);
  assert.match(refresh, /environment: staging/);
  assert.doesNotMatch(refresh, /concurrency:/);
  assert.doesNotMatch(
    [build, deploy, cleanup].join("\n"),
    /workflow_run:|neondatabase\//,
  );
});
