import { createSeedClient } from "./connections";
import {
  generateStagingDataset,
  generateStatementImportSample,
} from "./dataset";
import {
  readSeedConfig,
  SeedSafetyError,
  verifyServerIdentity,
} from "./target";
import { replaceStagingData } from "./writer";

export async function runStagingSeed(
  args: string[],
  env: NodeJS.ProcessEnv = process.env,
  input = "",
): Promise<string> {
  if (args.length === 1 && args[0] === "--sample-csv") {
    return generateStatementImportSample();
  }
  if (args.length !== 1 || args[0] !== "--manual")
    throw new SeedSafetyError(
      "Usage: seed --manual < input.json | seed --sample-csv",
    );
  const config = readSeedConfig(input, env);
  const seed = createSeedClient(config.seedConnection);
  try {
    await verifyServerIdentity(seed, config.target);
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
