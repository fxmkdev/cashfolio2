import { program } from "commander";
import { exec } from "../shared";
import { restoreLocal } from "../restore-local";
import { createRestoreRedisClient } from "../restore-redis-client";

program.command("restore-local").action(() =>
  restoreLocal({
    env: process.env,
    exec,
    createRedisClient: createRestoreRedisClient,
    log: console.log,
  }),
);
