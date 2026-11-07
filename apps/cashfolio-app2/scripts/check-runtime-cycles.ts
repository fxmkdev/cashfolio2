import { relative, resolve } from "node:path";
import ts from "typescript";
import {
  buildRuntimeGraph,
  findRuntimeCycles,
} from "../eslint-rules/runtime-cycles.ts";

const configPath = resolve("tsconfig.json");
const config = ts.readConfigFile(configPath, ts.sys.readFile);
if (config.error)
  throw new Error(
    ts.flattenDiagnosticMessageText(config.error.messageText, "\n"),
  );
const parsed = ts.parseJsonConfigFileContent(
  config.config,
  ts.sys,
  process.cwd(),
);
if (parsed.errors.length)
  throw new Error(
    parsed.errors
      .map((error) => ts.flattenDiagnosticMessageText(error.messageText, "\n"))
      .join("\n"),
  );
const sourceRoot = resolve("src");
const files = parsed.fileNames.filter((file) =>
  file.startsWith(sourceRoot + "/"),
);
const graph = buildRuntimeGraph(files, parsed.options);
const cycles = findRuntimeCycles(graph);
if (cycles.length) {
  console.error("Runtime dependency cycles:");
  for (const cycle of cycles)
    console.error(
      cycle.map((file) => relative(process.cwd(), file)).join(" -> "),
    );
  process.exitCode = 1;
} else
  console.log(
    `No runtime dependency cycles in ${graph.size} production modules.`,
  );
