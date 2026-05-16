import { program } from "commander";
import "dotenv/config";
import "./commands";

program.name("cli");

const argv =
  process.argv[2] === "--"
    ? [...process.argv.slice(0, 2), ...process.argv.slice(3)]
    : process.argv;

program.parse(argv);
