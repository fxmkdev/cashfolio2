import {
  parseApprovedTarget,
  readExternalIds,
  requireValue,
} from "../../src/staging-seed/target.ts";
import { Neon } from "./neon.ts";
import { databaseName } from "./names.ts";

export async function prepareDatabase(
  input: {
    branch: string;
    environment: "staging" | "preview";
    flyApp: string;
    sha: string;
  },
  env: NodeJS.ProcessEnv,
  neon = new Neon(env),
) {
  if (
    !/^[a-f0-9]{40}$/.test(input.sha) ||
    !["staging", "preview"].includes(input.environment)
  )
    throw new Error("Invalid nonproduction deployment.");
  // Reject invalid deployment input before provisioning any resource.
  if (
    !/^[a-z0-9-]{1,63}$/.test(input.flyApp) ||
    (input.environment === "preview"
      ? !/^cashfolio-app2-pr-[1-9][0-9]*-[a-z0-9-]+$/.test(input.flyApp)
      : input.flyApp.startsWith("cashfolio-app2-pr-"))
  )
    throw new Error("Invalid nonproduction Fly app.");
  databaseName(input.branch);
  const testers = readExternalIds(requireValue(env, "SEED_USER_EXTERNAL_IDS"));
  const admins = readExternalIds(requireValue(env, "SEED_ADMIN_EXTERNAL_IDS"));
  if (admins.some((id) => !testers.includes(id)))
    throw new Error("Seed administrators must be configured testers.");
  const context = await neon.discover();
  const database = await neon.ensure(context, input.branch);
  const target = parseApprovedTarget(
    JSON.stringify({
      ...database.target,
      environment: input.environment,
      flyApp: input.flyApp,
    }),
  );
  return {
    target,
    secrets: {
      DATABASE_URL: database.databaseUrl,
      SEED_TARGET: JSON.stringify(target),
      SEED_USER_EXTERNAL_IDS: testers.join(","),
      SEED_ADMIN_EXTERNAL_IDS: admins.join(","),
    },
    outputs: {
      database: target.database,
      database_project_id: target.projectId,
      database_branch_id: target.branchId,
      deploy_sha: input.sha,
    },
  };
}
