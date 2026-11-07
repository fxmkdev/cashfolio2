// Test-only command adapter for executing the workflow's actual Bash step.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { appendFileSync } from "node:fs";

const [command, ...args] = process.argv.slice(2);
const run = (executable: string, argv: readonly string[]) =>
  execFileSync(executable, argv, { encoding: "utf8" });

if (
  process.env.RELEASE_TEST_FAIL &&
  args.includes(process.env.RELEASE_TEST_FAIL)
) {
  console.error(`${process.env.RELEASE_TEST_FAIL} failed`);
  process.exit(23);
}

if (command === "git") {
  process.stdout.write(run("git", args));
} else {
  assert.equal(command, "pnpm");
  assert.deepEqual(args.slice(0, 2), ["exec", "releaser"]);
  if (args[2] === "publish") {
    // Reproduce the CLI's tag/push against the fixture's local origin, without
    // contacting GitHub's release API. Version calculation uses its real CLI.
    appendFileSync(
      process.env.RELEASE_TEST_LOG!,
      JSON.stringify({
        cwd: process.cwd(),
        args,
        commit: run("git", ["rev-parse", "HEAD"]).trim(),
      }) + "\n",
    );
    run("git", ["tag", `v${args[3]}`]);
    run("git", ["push", "origin", `v${args[3]}`]);
  } else {
    assert.equal(args[2], "get-version");
    let output =
      process.env.RELEASE_TEST_METADATA ??
      run(process.execPath, [
        process.env.RELEASE_TEST_RELEASER!,
        ...args.slice(2),
      ]);
    if (process.env.RELEASE_TEST_SHA) {
      const metadata: Record<string, unknown> = JSON.parse(output);
      metadata.sha = process.env.RELEASE_TEST_SHA;
      metadata.versionWithSha = `${metadata.version}-${metadata.sha}`;
      output = JSON.stringify(metadata);
    }
    process.stdout.write(output);
  }
}
