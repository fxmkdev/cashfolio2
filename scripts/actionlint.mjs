import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const isWindows = process.platform === "win32";
const binName = isWindows ? "github-actionlint.cmd" : "github-actionlint";
const localBin = path.join(repoRoot, "node_modules", ".bin", binName);
const command = existsSync(localBin) ? localBin : binName;

process.env.ACTIONLINT_CACHE_DIR ??= path.join(
  repoRoot,
  "node_modules",
  ".cache",
  "github-actionlint",
);

const child = spawn(command, process.argv.slice(2), {
  cwd: repoRoot,
  env: process.env,
  shell: isWindows,
  stdio: "inherit",
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 1);
});

child.on("error", (error) => {
  console.error(error.message);
  process.exit(1);
});
