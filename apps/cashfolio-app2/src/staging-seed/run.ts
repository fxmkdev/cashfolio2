import { createSeedClient } from "./connections";
import {
  generateStagingDataset,
  generateStatementImportSample,
} from "./dataset";
import {
  parseVerifiedConnection,
  readSeedConfig,
  SeedSafetyError,
  verifyServerIdentity,
} from "./target";
import { replaceStagingData } from "./writer";

export async function runStagingSeed(
  args: string[],
  env: NodeJS.ProcessEnv = process.env,
): Promise<string> {
  if (args.length === 1 && args[0] === "--sample-csv") {
    return generateStatementImportSample();
  }
  const checkOnly = args.length === 1 && args[0] === "--check-target";
  if (args.length && !checkOnly)
    throw new SeedSafetyError("Usage: seed [--check-target | --sample-csv]");
  const config = readSeedConfig(env, !checkOnly);
  const seed = createSeedClient(config.seedConnection);
  try {
    if (checkOnly) {
      // A staging DATABASE_URL accidentally pointing at production must also
      // fail before the release command runs Prisma migrations.
      if (!env.DATABASE_URL)
        throw new SeedSafetyError(
          "DATABASE_URL is required to verify the staging migration target.",
        );
      const connection = parseVerifiedConnection(
        env.DATABASE_URL,
        config.target,
        true,
      );
      const migration = createSeedClient(connection);
      try {
        await verifyServerIdentity(seed, config.target);
        await verifyServerIdentity(migration, {
          ...config.target,
          role: connection.user,
        });
      } finally {
        await migration.$disconnect();
      }
      return JSON.stringify({ event: "staging_seed_target_verified" });
    }
    const summary = await replaceStagingData(
      seed,
      config,
      generateStagingDataset(),
    );
    return JSON.stringify({ event: "staging_seed_complete", ...summary });
  } finally {
    await seed.$disconnect();
  }
}
