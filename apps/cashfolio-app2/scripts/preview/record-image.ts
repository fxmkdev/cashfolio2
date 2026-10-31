import { execFile } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { setTimeout } from "node:timers/promises";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { validateManifest } from "./github.ts";
import { prNumber } from "./names.ts";
import { requireValue } from "../../src/staging-seed/target.ts";

const execute = promisify(execFile);
type ImageBuild = {
  image: string;
  imageApp: string;
  number: number;
  sha: string;
};
type Commands = {
  run: (args: string[]) => Promise<string>;
  pause: (milliseconds: number) => Promise<unknown>;
};

export async function publishedImage(
  build: ImageBuild,
  commands: Commands = {
    run: async (args) =>
      (
        await execute("docker", args, {
          timeout: 60_000,
          maxBuffer: 4 * 1024 * 1024,
        })
      ).stdout,
    pause: setTimeout,
  },
) {
  prNumber(build.number);
  if (
    !/^[a-z0-9-]+$/.test(build.imageApp) ||
    !/^[a-f0-9]{40}$/.test(build.sha) ||
    !new RegExp(
      `^registry\\.fly\\.io/${build.imageApp}:pr-${build.sha}-[0-9]+-[0-9]+$`,
    ).test(build.image)
  )
    throw new Error("Invalid preview image build identity.");
  // Depot can finish before the pushed tag is readable through the registry.
  for (let attempt = 1; ; attempt++) {
    try {
      await commands.run(["pull", build.image]);
      break;
    } catch {
      if (attempt === 7)
        throw new Error(
          "The published preview image did not become available.",
        );
      await commands.pause(20_000);
    }
  }
  const digests: unknown = JSON.parse(
    await commands.run([
      "image",
      "inspect",
      build.image,
      "--format",
      "{{json .RepoDigests}}",
    ]),
  );
  const prefix = `registry.fly.io/${build.imageApp}@sha256:`;
  const image = Array.isArray(digests)
    ? digests.find(
        (value) => typeof value === "string" && value.startsWith(prefix),
      )
    : undefined;
  const manifest = { pr: build.number, sha: build.sha, image };
  validateManifest(manifest, build.number, build.sha, build.imageApp);
  return manifest;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    const metadata = await publishedImage({
      image: requireValue(process.env, "IMAGE"),
      imageApp: requireValue(process.env, "FLY_CASHFOLIO_APP_STAGING_APP"),
      number: Number(requireValue(process.env, "PR_NUMBER")),
      sha: requireValue(process.env, "PR_SHA"),
    });
    await writeFile(
      join(requireValue(process.env, "RUNNER_TEMP"), "preview-image.json"),
      JSON.stringify(metadata),
    );
  } catch {
    console.error(
      "Failed to record the published preview image; no deployment metadata was produced.",
    );
    process.exitCode = 1;
  }
}
