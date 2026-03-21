import { program } from "commander";
import { exec } from "../shared";

program
  .command("proxy-redis")
  .argument(
    "<environment>",
    "The environment to proxy to, 'prod' or 'staging'",
  )
  .action(async (environment) => {
    console.log(`Proxying to Redis on environment '${environment}'`);

    process.on("SIGINT", () => {
      process.exit(0);
    });

    const [localPort, appName] = getRedisSetup(environment);

    await exec(
      `fly proxy ${localPort}:6379 ${appName}.flycast --app ${appName}`,
    );
  });

function getRedisSetup(environment: string) {
  switch (environment) {
    case "prod":
      return [6383, "cashfolio-redis"];
    case "staging":
      return [6382, "cashfolio-redis-staging"];
    default:
      throw new Error(
        `Unknown environment '${environment}'. Use 'prod' or 'staging'.`,
      );
  }
}
