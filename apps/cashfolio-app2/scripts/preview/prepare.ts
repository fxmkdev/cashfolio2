import { appendFile, readFile, lstat } from "node:fs/promises";
import { provisionDatabase } from "./database.ts";
import {
  githubApi,
  validatePr,
  validateManifest,
  type PullRequest,
} from "./github.ts";
import {
  command,
  databaseUrl,
  verifiedProvisioner,
  serializeFlySecrets,
} from "./runtime.ts";
import { prNumber, previewNames } from "./names.ts";
import {
  parseApprovedTarget,
  readExternalIds,
  requireValue,
} from "../../src/staging-seed/target.ts";

let phase = "input validation";
try {
  const number = prNumber(Number(process.env.PR_NUMBER));
  const api = githubApi(
    process.env.GITHUB_REPOSITORY!,
    process.env.GITHUB_TOKEN!,
  );
  const pr = await api<PullRequest>(`/pulls/${number}`);
  validatePr(pr, process.env.GITHUB_REPOSITORY!, process.env.PR_SHA);
  const manifestPath = requireValue(process.env, "MANIFEST_PATH");
  const stat = await lstat(manifestPath);
  if (!stat.isFile() || stat.size > 2048)
    throw new Error("Invalid image metadata file.");
  const metadata = await readFile(
    requireValue(process.env, "MANIFEST_PATH"),
    "utf8",
  );
  if (metadata.length > 2048) throw new Error("Oversized image metadata.");
  const image = validateManifest(
    JSON.parse(metadata),
    number,
    pr.head.sha,
    requireValue(process.env, "FLY_CASHFOLIO_APP_STAGING_APP"),
  );
  const names = previewNames(number, pr.head.ref, pr.title);
  await appendFile(
    process.env.GITHUB_OUTPUT!,
    `fly_app=${names.flyApp}\npreview_hostname=${names.hostname}\npreview_url=${names.previewUrl}\nimage=${image}\n`,
  );
  const testerIds = readExternalIds(
    requireValue(process.env, "SEED_USER_EXTERNAL_IDS"),
  );
  const adminIds = readExternalIds(
    requireValue(process.env, "SEED_ADMIN_EXTERNAL_IDS"),
  );
  if (adminIds.some((id) => !testerIds.includes(id)))
    throw new Error("Seed administrators must be configured testers.");
  const passwordKey = requireValue(
    process.env,
    "PREVIEW_DATABASE_PASSWORD_KEY",
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
  phase = "host verification";
  const { client, target: host } = await verifiedProvisioner();
  try {
    phase = "database provisioning";
    const preview = await provisionDatabase(client, {
      number,
      headRef: pr.head.ref,
      title: pr.title,
      passwordKey,
      adminRole: host.role,
    });
    const target = parseApprovedTarget(
      JSON.stringify({
        ...host,
        environment: "preview",
        flyApp: preview.flyApp,
        database: preview.database,
        role: preview.seedRole,
        migrationRole: preview.appRole,
      }),
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
    const mask = (value: string) =>
      console.log(
        `::add-mask::${value.replaceAll("%", "%25").replaceAll("\r", "%0D").replaceAll("\n", "%0A")}`,
      );
    mask(preview.appPassword);
    mask(preview.seedPassword);
    for (const id of [...testerIds, ...adminIds]) mask(id);
    const { randomBytes } = await import("node:crypto");
    const secrets = {
      ...appSecrets,
      DATABASE_URL: databaseUrl(target, preview.appRole, preview.appPassword),
      SEED_DATABASE_URL: databaseUrl(
        target,
        preview.seedRole,
        preview.seedPassword,
      ),
      SEED_TARGET: JSON.stringify(target),
      SEED_USER_EXTERNAL_IDS: testerIds.join(","),
      SEED_ADMIN_EXTERNAL_IDS: adminIds.join(","),
      REDIS_URL: redisUrl,
      SESSION_SECRET: randomBytes(32).toString("hex"),
    };
    mask(secrets.SESSION_SECRET);
    mask(secrets.DATABASE_URL);
    mask(secrets.SEED_DATABASE_URL);
    // stdin avoids putting values in command arguments or workflow outputs.
    const dotenv = serializeFlySecrets(secrets);
    phase = "preview credential staging";
    await command(
      ["secrets", "import", "--app", preview.flyApp, "--stage"],
      dotenv,
    );
    phase = "final PR head validation";
    validatePr(
      await api<PullRequest>(`/pulls/${number}`),
      process.env.GITHUB_REPOSITORY!,
      pr.head.sha,
    );
    await appendFile(
      process.env.GITHUB_OUTPUT!,
      `fly_app=${preview.flyApp}\npreview_hostname=${preview.hostname}\npreview_url=${preview.previewUrl}\nimage=${image}\ndatabase=${preview.database}\n`,
    );
  } finally {
    await client.end();
  }
} catch {
  console.error(
    `Preview preparation failed during ${phase}. Inspect resources with operator access; raw provider diagnostics are suppressed.`,
  );
  process.exitCode = 1;
}
