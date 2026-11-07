import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import {
  parseVersionInfo,
  publishRelease,
  type RunCommand,
} from "./publish-release.ts";

const releaser = createRequire(import.meta.url).resolve("@fxmk/releaser");

function fixture(t: TestContext) {
  const root = mkdtempSync(join(tmpdir(), "cashfolio-release-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const origin = join(root, "origin.git");
  const first = join(root, "first");
  const second = join(root, "second");
  const publications: {
    cwd: string;
    args: readonly string[];
    commit: string;
  }[] = [];
  const notices: string[] = [];
  const exec = (cwd: string, command: string, args: readonly string[]) =>
    execFileSync(command, args, {
      cwd,
      encoding: "utf8",
      env: { ...process.env, GITHUB_HEAD_REF: "" },
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  const git = (cwd: string, ...args: string[]) => exec(cwd, "git", args);
  git(root, "init", "--bare", "--initial-branch=main", origin);
  git(root, "init", "--initial-branch=main", first);
  git(first, "config", "user.name", "Release Test");
  git(first, "config", "user.email", "release@example.com");
  git(first, "remote", "add", "origin", origin);
  const commit = (message: string) => {
    git(first, "commit", "--allow-empty", "-m", message);
    return git(first, "rev-parse", "HEAD");
  };
  commit("chore: initial release");
  git(first, "tag", "v0.21.0");
  git(first, "push", "origin", "main", "--tags");
  const run =
    (cwd: string): RunCommand =>
    (command, args) => {
      if (command === "pnpm") {
        assert.deepEqual(args.slice(0, 2), ["exec", "releaser"]);
        if (args[2] === "publish") {
          publications.push({
            cwd,
            args,
            commit: git(cwd, "rev-parse", "HEAD"),
          });
          // Only publication is intercepted: reproduce the CLI's tag/push without
          // contacting GitHub's release API. Version calculation uses its real CLI.
          git(cwd, "tag", `v${args[3]}`);
          git(cwd, "push", "origin", `v${args[3]}`);
          return "";
        }
        return exec(cwd, process.execPath, [releaser, ...args.slice(2)]);
      }
      return exec(cwd, command, args);
    };
  const metadata = (cwd: string, forceRelease = false) =>
    parseVersionInfo(
      run(cwd)("pnpm", [
        "exec",
        "releaser",
        "get-version",
        ...(forceRelease ? ["--release"] : []),
      ]),
    );
  const inputs = (cwd: string, forceRelease = false) => ({
    version: metadata(cwd, forceRelease).version,
    sha: git(cwd, "rev-parse", "--short", "HEAD"),
    commit: git(cwd, "rev-parse", "HEAD"),
    forceRelease,
  });
  const publish = (cwd: string, original = inputs(cwd)) =>
    publishRelease(original, run(cwd), (message) => notices.push(message));
  const cloneSecond = () => {
    git(first, "push", "origin", "main");
    git(root, "clone", origin, second);
  };
  return {
    first,
    second,
    origin,
    git,
    commit,
    run,
    metadata,
    inputs,
    publish,
    cloneSecond,
    publications,
    notices,
  };
}

test("overlapping runs refresh tags after a winner publishes at an earlier commit", (t) => {
  const f = fixture(t);
  f.commit("feat: release feature\n\n!release");
  const winner = f.inputs(f.first);
  f.commit("refactor: ordinary following change");
  f.cloneSecond();
  const waiting = f.inputs(f.second);
  assert.equal(winner.version, "0.22.0");
  assert.equal(waiting.version, winner.version);
  f.git(f.first, "checkout", "--detach", winner.commit);
  assert.equal(f.publish(f.first, winner), "published");
  assert.equal(f.git(f.second, "tag", "--list", "v0.22.0"), "");
  assert.equal(f.publish(f.second, waiting), "skipped");
  assert.equal(f.metadata(f.second).isNewRelease, false);
  assert.equal(f.git(f.second, "rev-parse", "v0.22.0"), winner.commit);
  assert.equal(f.git(f.second, "rev-parse", "HEAD"), waiting.commit);
  assert.equal(f.publications.length, 1);
  assert.match(f.notices[0]!, /v0.22.0 already exists/);
});

test("overlapping runs at the same commit publish only once", (t) => {
  const f = fixture(t);
  f.commit("fix: release fix\n\n!release");
  f.cloneSecond();
  const original = f.inputs(f.second);
  assert.equal(f.publish(f.first), "published");
  assert.equal(f.publish(f.second, original), "skipped");
  assert.equal(f.publications.length, 1);
});

test("a forced overlapping run cannot republish an occupied version", (t) => {
  const f = fixture(t);
  const winner = f.commit("fix: first change");
  const original = f.inputs(f.first, true);
  f.commit("fix: following change");
  f.cloneSecond();
  const waiting = f.inputs(f.second, true);
  assert.equal(waiting.version, original.version);
  f.git(f.first, "checkout", "--detach", winner);
  assert.equal(f.publish(f.first, original), "published");
  assert.equal(f.publish(f.second, waiting), "skipped");
  assert.equal(f.metadata(f.second, true).version, "0.21.2");
  assert.equal(f.publications.length, 1);
});

for (const forceRelease of [false, true]) {
  test(`normal publication preserves commit and version (force=${forceRelease})`, (t) => {
    const f = fixture(t);
    f.commit(`fix: release change${forceRelease ? "" : "\n\n!release"}`);
    const original = f.inputs(f.first, forceRelease);
    assert.equal(original.version, "0.21.1");
    // Main and Git's preferred abbreviation length may change while the run
    // waits. Publication must still target the original built commit.
    f.commit("feat: later main change");
    f.git(f.first, "push", "origin", "main");
    f.git(f.first, "checkout", "--detach", original.commit);
    f.git(f.first, "config", "core.abbrev", "12");
    assert.equal(f.publish(f.first, original), "published");
    assert.deepEqual(f.publications, [
      {
        cwd: f.first,
        args: ["exec", "releaser", "publish", original.version],
        commit: original.commit,
      },
    ]);
    assert.equal(
      f.git(f.origin, "rev-parse", `v${original.version}`),
      original.commit,
    );
  });
}

test("force release does not republish a commit without unreleased changes", (t) => {
  const f = fixture(t);
  const original = f.inputs(f.first, true);
  assert.equal(f.metadata(f.first, true).isNewRelease, false);
  assert.equal(f.publish(f.first, original), "skipped");
  assert.equal(f.publications.length, 0);
});

test("a new release marker after a concurrent release skips version drift", (t) => {
  const f = fixture(t);
  const earlier = f.commit("feat: first feature\n\n!release");
  f.commit("feat: second feature\n\n!release");
  f.cloneSecond();
  const original = f.inputs(f.second);
  // A different intervening tag advances the computed version while the built
  // version remains available. It must never publish the newly computed value.
  f.git(f.first, "tag", "v0.22.1", earlier);
  f.git(f.first, "push", "origin", "v0.22.1");
  assert.equal(f.publish(f.second, original), "skipped");
  assert.equal(f.metadata(f.second).version, "0.23.0");
  assert.match(f.notices[0]!, /differs from the built version 0.22.0/);
  assert.equal(f.publications.length, 0);
});

test("ordinary changes with no new release request are skipped", (t) => {
  const f = fixture(t);
  f.commit("fix: ordinary change");
  const original = { ...f.inputs(f.first), version: "0.21.1" };
  assert.equal(f.publish(f.first, original), "skipped");
  assert.match(f.notices[0]!, /no longer requests a new stable release/);
  assert.equal(f.publications.length, 0);
});

test("a tag at an unrelated commit is preserved", (t) => {
  const f = fixture(t);
  f.commit("fix: release change\n\n!release");
  f.cloneSecond();
  const original = f.inputs(f.second);
  f.git(f.first, "checkout", "--orphan", "other");
  const other = f.commit("feat: unrelated publication");
  f.git(f.first, "tag", `v${original.version}`);
  f.git(f.first, "push", "origin", `v${original.version}`);
  assert.equal(f.publish(f.second, original), "skipped");
  assert.equal(f.git(f.origin, "rev-parse", `v${original.version}`), other);
  assert.equal(f.publications.length, 0);
});

test("conflicting fetched tags fail without changing either existing tag", (t) => {
  const f = fixture(t);
  f.commit("fix: release change\n\n!release");
  f.cloneSecond();
  const original = f.inputs(f.second);
  f.git(f.first, "tag", `v${original.version}`, "v0.21.0");
  f.git(f.first, "push", "origin", `v${original.version}`);
  f.git(f.second, "tag", `v${original.version}`);
  const remote = f.git(f.origin, "rev-parse", `v${original.version}`);
  assert.throws(() => f.publish(f.second, original));
  assert.equal(f.git(f.origin, "rev-parse", `v${original.version}`), remote);
  assert.equal(
    f.git(f.second, "rev-parse", `v${original.version}`),
    original.commit,
  );
  assert.equal(f.publications.length, 0);
});

test("mismatched original and refreshed commits fail before publication", (t) => {
  const f = fixture(t);
  const previous = f.git(f.first, "rev-parse", "HEAD");
  f.commit("fix: release change\n\n!release");
  const original = f.inputs(f.first);
  assert.throws(
    () => f.publish(f.first, { ...original, commit: previous }),
    /built commit/,
  );
  assert.throws(
    () => f.publish(f.first, { ...original, sha: previous }),
    /built commit/,
  );
  const run: RunCommand = (command, args) => {
    const result = f.run(f.first)(command, args);
    if (args.includes("get-version")) {
      const metadata = parseVersionInfo(result);
      return JSON.stringify({
        ...metadata,
        sha: previous,
        versionWithSha: `${metadata.version}-${previous}`,
      });
    }
    return result;
  };
  assert.throws(() => publishRelease(original, run), /built commit/);
  assert.equal(f.publications.length, 0);
});

test("malformed metadata and command failures are not converted into skips", (t) => {
  const f = fixture(t);
  f.commit("fix: release change\n\n!release");
  const original = f.inputs(f.first);
  for (const json of [
    "not json",
    "null",
    "{}",
    JSON.stringify({ ...f.metadata(f.first), isNewRelease: "true" }),
  ]) {
    const run: RunCommand = (command, args) =>
      args.includes("get-version") ? json : f.run(f.first)(command, args);
    assert.throws(() => publishRelease(original, run));
  }
  for (const failingCommand of ["fetch", "get-version", "publish"]) {
    const failure = new Error(`${failingCommand} failed`);
    const run: RunCommand = (command, args) => {
      if (args.includes(failingCommand)) throw failure;
      return f.run(f.first)(command, args);
    };
    assert.throws(
      () => publishRelease(original, run),
      (error) => error === failure,
    );
  }
  assert.equal(f.publications.length, 0);
});

test("workflow retains eligibility, lock, commit pin, and version inputs", () => {
  const workflow = readFileSync(
    new URL("../.github/workflows/build.yml", import.meta.url),
    "utf8",
  );
  const release = workflow.slice(workflow.indexOf("\n  release:\n"));
  assert.match(
    release,
    /github.event_name != 'pull_request' &&\s+needs.version.outputs.is_new_release\s+== 'true'/,
  );
  assert.match(
    release,
    /concurrency:\s+group: release\s+cancel-in-progress: false/,
  );
  assert.match(release, /ref: \$\{\{ github.sha \}\}/);
  assert.match(release, /RELEASE_COMMIT: \$\{\{ github.sha \}\}/);
  assert.match(
    release,
    /RELEASE_VERSION: \$\{\{ needs.version.outputs.version \}\}/,
  );
  assert.match(release, /RELEASE_SHA: \$\{\{ needs.version.outputs.sha \}\}/);
  assert.match(
    release,
    /FORCE_RELEASE:\s+\$\{\{ github.event_name == 'workflow_dispatch' && inputs.force_release\s+\}\}/,
  );
  assert.match(release, /run: pnpm exec node scripts\/publish-release.ts/);
  assert.match(workflow, /run: pnpm test:release/);
  assert.match(workflow, /run: pnpm typecheck:release/);
});
