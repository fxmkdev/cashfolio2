import { program } from "commander";
import { exec } from "../shared";
import { restoreLocal } from "../restore-local";
import { createClient, type AnyRedisClientOptions } from "redis";

const redisClientOptions = {
  RESP: 2,
  commandOptions: { timeout: undefined },
} satisfies AnyRedisClientOptions;

program.command("restore-local").action(() =>
  restoreLocal({
    env: process.env,
    exec,
    createRedisClient: (url) => {
      const redis = createClient({ ...redisClientOptions, url });
      redis.on("error", (error) =>
        console.error("Restore Redis client error", error),
      );
      return redis;
    },
    log: console.log,
  }),
);
