import { appendFile } from "node:fs/promises";
import { prepareDatabase } from "../nonproduction/prepare.ts";
import { previewNames } from "./names.ts";
import {
  githubApi,
  validatePr,
  validatePreviewImage,
  type PullRequest,
} from "./github.ts";
import { command, stageFlySecrets, serializeFlySecrets } from "./runtime.ts";
import { prNumber } from "./names.ts";
import { requireValue } from "../../src/staging-seed/target.ts";

let phase = "input validation";
try {
  const number = prNumber(Number(process.env.PR_NUMBER));
  const sha = requireValue(process.env, "PR_SHA");
  const api = githubApi(
    process.env.GITHUB_REPOSITORY!,
    process.env.GITHUB_TOKEN!,
  );
  const pr = await api<PullRequest>(`/pulls/${number}`);
  validatePr(pr, process.env.GITHUB_REPOSITORY!, sha);
  validatePreviewImage(
    requireValue(process.env, "PREVIEW_IMAGE"),
    requireValue(process.env, "FLY_CASHFOLIO_APP_STAGING_APP"),
  );
  // Validate every app secret before creating any resources.
  const appSecrets = Object.fromEntries(
    [
      "LOGTO_APP_SECRET",
      "LOGTO_MANAGEMENT_API_APP_SECRET",
      "CURRENCYLAYER_API_KEY",
      "COINLAYER_API_KEY",
      "MARKETSTACK_API_KEY",
    ].map((key) => [key, requireValue(process.env, key)]),
  );
  const redisUrl = requireValue(process.env, "STAGING_REDIS_URL");
  requireValue(process.env, "FLY_API_TOKEN");
  requireValue(process.env, "FLY_ORG");
  serializeFlySecrets({ ...appSecrets, REDIS_URL: redisUrl });
  const preview = previewNames(number, pr.head.ref);
  phase = "database provisioning";
  const prepared = await prepareDatabase(
    {
      branch: pr.head.ref,
      environment: "preview",
      flyApp: preview.flyApp,
      sha: pr.head.sha,
    },
    process.env,
  );
  // List first so a failed status request cannot accidentally create an app.
  phase = "Fly app setup";
  const apps = JSON.parse(await command(["apps", "list", "--json"])) as {
    Name: string;
    name?: string;
  }[];
  if (!apps.some((app) => (app.Name ?? app.name) === preview.flyApp))
    await command([
      "apps",
      "create",
      preview.flyApp,
      "--org",
      requireValue(process.env, "FLY_ORG"),
    ]);
  const { randomBytes } = await import("node:crypto");
  const secrets = {
    ...appSecrets,
    ...prepared.secrets,
    REDIS_URL: redisUrl,
    SESSION_SECRET: randomBytes(32).toString("hex"),
  };
  // stdin avoids putting values in command arguments or workflow outputs.
  phase = "preview credential staging";
  await stageFlySecrets(preview.flyApp, secrets);
  phase = "final PR head validation";
  validatePr(
    await api<PullRequest>(`/pulls/${number}`),
    process.env.GITHUB_REPOSITORY!,
    pr.head.sha,
  );
  await appendFile(
    process.env.GITHUB_OUTPUT!,
    `fly_app=${preview.flyApp}\npreview_hostname=${preview.hostname}\npreview_url=${preview.previewUrl}\n` +
      Object.entries(prepared.outputs)
        .map(([key, value]) => `${key}=${value}\n`)
        .join(""),
  );
} catch {
  console.error(
    `Preview preparation failed during ${phase}. Inspect resources with operator access; raw provider diagnostics are suppressed.`,
  );
  process.exitCode = 1;
}
