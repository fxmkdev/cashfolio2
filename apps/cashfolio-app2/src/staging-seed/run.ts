import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { createSeedClient } from "./connections";
import {
  generateStagingDataset,
  generateStatementImportSample,
} from "./dataset";
import { runSeedRelease } from "./release";
import {
  parseVerifiedConnection,
  readSeedConfig,
  requireValue,
  SeedSafetyError,
  verifyServerIdentity,
} from "./target";
import { replaceStagingData } from "./writer";

const execute = promisify(execFile);
const migrationScript = fileURLToPath(
  new URL("../../scripts/prisma-migrate-deploy-with-retry.sh", import.meta.url),
);

export async function runStagingSeed(
  args: string[],
  env: NodeJS.ProcessEnv = process.env,
): Promise<string> {
  if (args.length === 1 && args[0] === "--sample-csv")
    return generateStatementImportSample();
  const command = args.length === 0 ? "seed" : args.length === 1 ? args[0] : "";
  if (
    !["seed", "--check-target", "--grant-permissions", "--release"].includes(
      command,
    )
  )
    throw new SeedSafetyError(
      "Usage: seed [--release | --check-target | --grant-permissions | --sample-csv]",
    );
  // Reject production and incomplete configuration before any subprocess or connection.
  const config = readSeedConfig(env);
  const migrationTarget = {
    ...config.target,
    role: config.target.migrationRole,
  };
  const migrationConnection = parseVerifiedConnection(
    requireValue(env, "DATABASE_URL"),
    migrationTarget,
    true,
  );
  if (command === "--release") {
    return runSeedRelease({
      verify: () => runStagingSeed(["--check-target"], env),
      migrate: async () => {
        try {
          await execute("sh", [migrationScript], {
            env,
            maxBuffer: 4 * 1024 * 1024,
          });
        } catch {
          // Do not forward raw Prisma output, SQL or driver diagnostics into logs.
          throw new SeedSafetyError(
            "Migration failed; seeding was not attempted.",
          );
        }
      },
      grant: () => runStagingSeed(["--grant-permissions"], env),
      replace: () => runStagingSeed([], env),
    });
  }
  const seed = createSeedClient(config.seedConnection);
  try {
    if (command !== "seed") {
      const migration = createSeedClient(migrationConnection);
      try {
        await verifyServerIdentity(seed, config.target);
        await verifyServerIdentity(migration, migrationTarget);
        if (command === "--grant-permissions") {
          const role = `"${config.target.role}"`; // Validated SQL identifier, never a free-form input.
          await migration.$executeRawUnsafe(
            `GRANT USAGE ON SCHEMA public TO ${role}`,
          );
          await migration.$executeRawUnsafe(
            `GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "User", "UserAccountBookLink", "AccountBook", "AccountGroup", "Account", "Transaction", "Booking" TO ${role}`,
          );
          await migration.$executeRawUnsafe(
            `GRANT EXECUTE ON FUNCTION public.ensure_gain_loss_account_for_new_book() TO ${role}`,
          );
        }
      } finally {
        await migration.$disconnect();
      }
      return JSON.stringify({ event: "seed_target_verified" });
    }
    const summary = await replaceStagingData(
      seed,
      config,
      generateStagingDataset(),
    );
    return JSON.stringify({
      event: "seed_complete",
      environment: config.target.environment,
      ...summary,
    });
  } finally {
    await seed.$disconnect();
  }
}
