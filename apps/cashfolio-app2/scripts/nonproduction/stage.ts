import { appendFile } from "node:fs/promises";
import { requireValue } from "../../src/staging-seed/target.ts";
import { stageFlySecrets } from "../preview/runtime.ts";
import { prepareDatabase } from "./prepare.ts";

try {
  const flyApp = requireValue(process.env, "FLY_APP");
  requireValue(process.env, "FLY_API_TOKEN");
  const prepared = await prepareDatabase(
    {
      branch: requireValue(process.env, "SOURCE_BRANCH"),
      environment: "staging",
      flyApp,
      sha: requireValue(process.env, "DEPLOY_SHA"),
    },
    process.env,
  );
  await stageFlySecrets(flyApp, prepared.secrets);
  await appendFile(
    requireValue(process.env, "GITHUB_OUTPUT"),
    Object.entries(prepared.outputs)
      .map(([key, value]) => `${key}=${value}\n`)
      .join(""),
  );
} catch {
  console.error(
    "Nonproduction database preparation failed; raw provider diagnostics are suppressed.",
  );
  process.exitCode = 1;
}
