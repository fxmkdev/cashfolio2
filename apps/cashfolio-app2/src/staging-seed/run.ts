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
  if (!["seed", "--check-target", "--release"].includes(command))
    throw new SeedSafetyError(
      "Usage: seed [--release | --check-target | --sample-csv]",
    );
  // Reject production and incomplete configuration before any subprocess or connection.
  const config = readSeedConfig(env);
  if (command === "--release") {
    return runSeedRelease({
      verify: () => runStagingSeed(["--check-target"], env),
      migrate: async () => {
        // Prisma's migration engine has different TLS URL semantics from pg.
        // Require certificate verification on this new connection as well.
        const migrationUrl = new URL(requireValue(env, "DATABASE_URL"));
        migrationUrl.searchParams.set("sslmode", "require");
        migrationUrl.searchParams.set("sslaccept", "strict");
        try {
          await execute("sh", [migrationScript], {
            env: { ...env, DATABASE_URL: migrationUrl.href },
            maxBuffer: 4 * 1024 * 1024,
          });
        } catch {
          // Do not forward raw Prisma output, SQL or driver diagnostics into logs.
          throw new SeedSafetyError(
            "Migration failed; seeding was not attempted.",
          );
        }
      },
      replace: () => runStagingSeed([], env),
    });
  }
  const seed = createSeedClient(config.connection);
  try {
    if (command === "--check-target") {
      await verifyServerIdentity(seed, config.target);
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
