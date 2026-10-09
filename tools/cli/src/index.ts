import { program } from "commander";
import { config } from "dotenv";
import "./commands";

config();

program.name("cli");

const argv =
  process.argv[2] === "--"
    ? [...process.argv.slice(0, 2), ...process.argv.slice(3)]
    : process.argv;

program.parse(argv);
