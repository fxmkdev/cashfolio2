import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

const script = fileURLToPath(new URL("release-staging.sh", import.meta.url));

function runRelease(overrides = {}) {
  const directory = mkdtempSync(join(tmpdir(), "cashfolio-release-test-"));
  const log = join(directory, "calls");
  try {
    writeFileSync(
      join(directory, "node"),
      `#!/bin/sh
stage=seed
if [ "\${2:-}" = "--check-target" ]; then stage=check-target; fi
printf '%s\\n' "$stage" >> "$TEST_RELEASE_LOG"
if [ "$stage" = "\${TEST_NODE_FAILURE_STAGE:-}" ]; then exit 7; fi
`,
      { mode: 0o755 },
    );
    writeFileSync(
      join(directory, "sh"),
      `#!/bin/sh
printf '%s\\n' migrate >> "$TEST_RELEASE_LOG"
exit "\${TEST_MIGRATION_STATUS:-0}"
`,
      { mode: 0o755 },
    );
    writeFileSync(log, "");
    const env = {
      ...process.env,
      PATH: `${directory}:${process.env.PATH}`,
      TEST_RELEASE_LOG: log,
      ...overrides,
    };
    delete env.DATABASE_URL;
    delete env.STAGING_SEED_DATABASE_URL;
    if (!("STAGING_SEED_ENABLED" in overrides)) {
      delete env.STAGING_SEED_ENABLED;
    }
    const result = spawnSync("/bin/sh", [script], { env, encoding: "utf8" });
    return {
      status: result.status,
      stderr: result.stderr,
      calls: readFileSync(log, "utf8").trim().split("\n").filter(Boolean),
    };
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

test("enabled release validates both targets before migrations and replacement", () => {
  const result = runRelease({ STAGING_SEED_ENABLED: "true" });
  assert.equal(result.status, 0);
  assert.deepEqual(result.calls, ["check-target", "migrate", "seed"]);
});

for (const enabled of [undefined, "", "false"]) {
  test(`disabled release applies migrations without loading the seed (${enabled ?? "unset"})`, () => {
    const result = runRelease(
      enabled === undefined ? {} : { STAGING_SEED_ENABLED: enabled },
    );
    assert.equal(result.status, 0);
    assert.deepEqual(result.calls, ["migrate"]);
  });
}

test("target rejection prevents migrations and replacement", () => {
  const result = runRelease({
    STAGING_SEED_ENABLED: "true",
    TEST_NODE_FAILURE_STAGE: "check-target",
  });
  assert.equal(result.status, 7);
  assert.deepEqual(result.calls, ["check-target"]);
});

test("migration failure prevents replacement", () => {
  const result = runRelease({
    STAGING_SEED_ENABLED: "true",
    TEST_MIGRATION_STATUS: "9",
  });
  assert.equal(result.status, 9);
  assert.deepEqual(result.calls, ["check-target", "migrate"]);
});

test("replacement failure fails the release", () => {
  const result = runRelease({
    STAGING_SEED_ENABLED: "true",
    TEST_NODE_FAILURE_STAGE: "seed",
  });
  assert.equal(result.status, 7);
  assert.deepEqual(result.calls, ["check-target", "migrate", "seed"]);
});

test("invalid enablement fails before any database command", () => {
  const result = runRelease({ STAGING_SEED_ENABLED: "yes" });
  assert.equal(result.status, 1);
  assert.deepEqual(result.calls, []);
  assert.match(result.stderr, /must be true or false/);
});
