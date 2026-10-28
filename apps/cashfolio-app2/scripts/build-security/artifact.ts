import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";

const forbiddenModule = /src\/e2e\/|(?:^|[/+@])msw(?:[/@+]|$)|@mswjs[+/]/;
const forbiddenCode =
  /cashfolio-e2e-external-id|e2e-mocked-provider-key|E2E User|Unhandled E2E valuation provider request/;

async function* files(directory: string): AsyncGenerator<string> {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) yield* files(path);
    else if (entry.isFile()) yield path;
  }
}

export async function checkDeploymentArtifact(
  output = ".output",
): Promise<void> {
  const server = join(output, "server");
  const manifest: unknown = JSON.parse(
    await readFile(join(server, "build-security.json"), "utf8"),
  );
  assert(
    manifest !== null &&
      typeof manifest === "object" &&
      "e2eBuild" in manifest &&
      manifest.e2eBuild === false,
    "Missing normal-build security manifest",
  );
  assert(
    "modules" in manifest &&
      Array.isArray(manifest.modules) &&
      manifest.modules.length > 0,
    "Missing emitted module metadata",
  );
  for (const id of manifest.modules) {
    assert(
      typeof id === "string" && !forbiddenModule.test(id),
      `Test-only module in deployment graph: ${id}`,
    );
  }
  for await (const file of files(output)) {
    const name = relative(output, file).replaceAll("\\", "/");
    assert(
      !forbiddenModule.test(name),
      `Test-only dependency packaged: ${name}`,
    );
    if (/\.(?:[cm]?js|json|map|tsx?)$/.test(file)) {
      const code = await readFile(file, "utf8");
      assert(
        !forbiddenCode.test(code),
        `Test-only implementation packaged: ${name}`,
      );
    }
  }
}
