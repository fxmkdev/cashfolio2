import { readFileSync } from "node:fs";
import { runStagingSeed } from "./run";
import { SeedSafetyError } from "./target";

try {
  const args = process.argv.slice(2);
  const input =
    args.length === 1 && args[0] === "--manual" ? readFileSync(0, "utf8") : "";
  console.log(await runStagingSeed(args, process.env, input));
} catch (error) {
  // Driver errors may contain connection information. Only our deliberate
  // safety messages are suitable for release logs.
  console.error(
    error instanceof SeedSafetyError
      ? error.message
      : "Database seed failed; inspect the database using operator credentials.",
  );
  process.exitCode = 1;
}
