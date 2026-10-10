import { runStagingSeed } from "./run";
import { SeedSafetyError } from "./target";

try {
  console.log(await runStagingSeed(process.argv.slice(2)));
} catch (error) {
  // Driver errors may contain connection information. Only our deliberate
  // safety messages are suitable for release logs.
  console.error(
    error instanceof SeedSafetyError
      ? error.message
      : "Staging seed failed; inspect the database using operator credentials.",
  );
  process.exitCode = 1;
}
