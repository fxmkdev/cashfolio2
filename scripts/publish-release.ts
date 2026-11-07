import { execFileSync } from "node:child_process";

export type RunCommand = (command: string, args: readonly string[]) => string;

export const runCommand: RunCommand = (command, args) =>
  execFileSync(command, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  }).trim();

const stableVersion = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const commitSha = /^[a-f0-9]{7,40}$/;

export function parseVersionInfo(json: string) {
  const value: unknown = JSON.parse(json);
  if (typeof value !== "object" || value === null) {
    throw new Error("Invalid releaser version metadata");
  }
  const {
    version,
    versionWithSha,
    isRelease,
    isNewRelease,
    releaseVersion,
    prereleaseTag,
    sha,
  } = value as Record<string, unknown>;
  if (
    typeof version !== "string" ||
    typeof versionWithSha !== "string" ||
    typeof isRelease !== "boolean" ||
    typeof isNewRelease !== "boolean" ||
    typeof releaseVersion !== "string" ||
    !stableVersion.test(releaseVersion) ||
    !(
      prereleaseTag === null ||
      (typeof prereleaseTag === "string" && prereleaseTag.length > 0)
    ) ||
    typeof sha !== "string" ||
    !commitSha.test(sha) ||
    version !==
      `${releaseVersion}${prereleaseTag ? `-${prereleaseTag}` : ""}` ||
    versionWithSha !== `${version}-${sha}` ||
    isRelease !== (prereleaseTag === null) ||
    (isNewRelease && !isRelease)
  ) {
    throw new Error("Invalid releaser version metadata");
  }
  return {
    version,
    versionWithSha,
    isRelease,
    isNewRelease,
    releaseVersion,
    prereleaseTag,
    sha,
  };
}

interface ReleaseInputs {
  version: string;
  sha: string;
  commit: string;
  forceRelease: boolean;
}

/** Must run within the workflow's release concurrency lock. */
export function publishRelease(
  inputs: ReleaseInputs,
  run: RunCommand = runCommand,
  notice: (message: string) => void = (message) =>
    console.log(`::notice::${message}`),
) {
  if (
    !stableVersion.test(inputs.version) ||
    !commitSha.test(inputs.sha) ||
    !/^[a-f0-9]{40}$/.test(inputs.commit)
  ) {
    throw new Error("Invalid original release metadata");
  }
  const head = run("git", ["rev-parse", "HEAD"]);
  const original = run("git", [
    "rev-parse",
    "--verify",
    `${inputs.sha}^{commit}`,
  ]);
  if (head !== inputs.commit || head !== original) {
    throw new Error("Release checkout does not match the built commit");
  }

  // Refresh tags, never HEAD. A conflicting tag must fail rather than be moved.
  run("git", ["fetch", "--tags", "origin"]);
  const refreshed = parseVersionInfo(
    run("pnpm", [
      "exec",
      "releaser",
      "get-version",
      ...(inputs.forceRelease ? ["--release"] : []),
    ]),
  );
  if (!head.startsWith(refreshed.sha)) {
    throw new Error(
      "Refreshed version metadata does not match the built commit",
    );
  }

  const tag = `v${inputs.version}`;
  let reason: string | undefined;
  if (run("git", ["tag", "--list", tag])) {
    reason = `${tag} already exists`;
  } else if (!refreshed.isNewRelease || !refreshed.isRelease) {
    reason = "the refreshed metadata no longer requests a new stable release";
  } else if (refreshed.version !== inputs.version) {
    reason = `the refreshed version ${refreshed.version} differs from the built version ${inputs.version}`;
  }
  if (reason) {
    notice(
      `Skipping release publication: ${reason}. Existing tags are preserved. Start a fresh workflow run if a release is still needed.`,
    );
    return "skipped";
  }

  const output = run("pnpm", [
    "exec",
    "releaser",
    "publish",
    refreshed.version,
  ]);
  if (output) console.log(output);
  return "published";
}

if (import.meta.main) {
  const forceRelease = process.env.FORCE_RELEASE;
  if (forceRelease !== "true" && forceRelease !== "false") {
    throw new Error("FORCE_RELEASE must be true or false");
  }
  publishRelease({
    version: process.env.RELEASE_VERSION ?? "",
    sha: process.env.RELEASE_SHA ?? "",
    commit: process.env.RELEASE_COMMIT ?? "",
    forceRelease: forceRelease === "true",
  });
}
