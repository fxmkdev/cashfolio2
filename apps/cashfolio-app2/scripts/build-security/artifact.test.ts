import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { checkDeploymentArtifact } from "./artifact.ts";

test("checks the emitted graph and packaged code independently", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "cashfolio-build-security-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const server = join(directory, "server");
  await mkdir(server);
  const manifest = async (modules: string[], e2eBuild = false) =>
    writeFile(
      join(server, "build-security.json"),
      JSON.stringify({ e2eBuild, modules }),
    );
  await assert.rejects(checkDeploymentArtifact(directory));
  await manifest(["src/auth/functions.server.ts"]);
  await writeFile(join(server, "index.mjs"), "export default {};");
  await checkDeploymentArtifact(directory);
  for (const module of [
    "src/e2e/auth.server.ts",
    "node_modules/msw/lib/node/index.mjs",
    "node_modules/@mswjs/interceptors/index.mjs",
  ]) {
    await manifest([module]);
    await assert.rejects(
      checkDeploymentArtifact(directory),
      /Test-only module/,
    );
  }
  await manifest(["src/auth/functions.server.ts"], true);
  await assert.rejects(
    checkDeploymentArtifact(directory),
    /normal-build security manifest/,
  );
  await manifest([]);
  await assert.rejects(checkDeploymentArtifact(directory), /module metadata/);
  await manifest(["src/auth/functions.server.ts"]);
  for (const code of [
    "cashfolio-e2e-external-id",
    "e2e-mocked-provider-key",
    "E2E User",
    "Unhandled E2E valuation provider request",
  ]) {
    await writeFile(join(server, "index.mjs"), JSON.stringify(code));
    await assert.rejects(
      checkDeploymentArtifact(directory),
      /Test-only implementation/,
    );
  }
  await writeFile(join(server, "index.mjs"), "");
  await mkdir(join(server, "node_modules/msw"), { recursive: true });
  await writeFile(join(server, "node_modules/msw/package.json"), "{}");
  await assert.rejects(
    checkDeploymentArtifact(directory),
    /dependency packaged/,
  );
});
