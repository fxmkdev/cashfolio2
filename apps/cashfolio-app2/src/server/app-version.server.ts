import { readFile } from "node:fs/promises";
import path from "node:path";

const UNKNOWN_APP_VERSION = "unknown";

type ReadPackageJson = (
  filePath: string,
  encoding: BufferEncoding,
) => Promise<string>;

export type AppVersionResolverOptions = {
  env?: NodeJS.ProcessEnv;
  cwd?: string;
  packageJsonPaths?: readonly string[];
  readPackageJson?: ReadPackageJson;
};

function normalizeVersion(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const version = value.trim();
  return version.length > 0 ? version : null;
}

function parsePackageJsonVersion(contents: string): string | null {
  try {
    const packageJson = JSON.parse(contents) as { version?: unknown };
    return normalizeVersion(packageJson.version);
  } catch {
    return null;
  }
}

function getRuntimePackageJsonPaths(args: {
  env: NodeJS.ProcessEnv;
  cwd: string;
}): string[] {
  return [
    args.env.npm_package_json,
    path.join(args.cwd, "package.json"),
    path.join(args.cwd, "apps/cashfolio-app2/package.json"),
  ].filter((candidate, index, candidates): candidate is string => {
    return (
      typeof candidate === "string" &&
      candidate.trim().length > 0 &&
      candidates.indexOf(candidate) === index
    );
  });
}

export async function resolveAppVersion({
  env = process.env,
  cwd = process.cwd(),
  packageJsonPaths = getRuntimePackageJsonPaths({ env, cwd }),
  readPackageJson = readFile,
}: AppVersionResolverOptions = {}): Promise<string> {
  const envVersion = normalizeVersion(env.npm_package_version);
  if (envVersion) {
    return envVersion;
  }

  for (const packageJsonPath of packageJsonPaths) {
    try {
      const version = parsePackageJsonVersion(
        await readPackageJson(packageJsonPath, "utf8"),
      );
      if (version) {
        return version;
      }
    } catch {
      // Keep trying other runtime package locations before falling back.
    }
  }

  return UNKNOWN_APP_VERSION;
}

let cachedAppVersion: Promise<string> | null = null;

export function getAppVersion(): Promise<string> {
  cachedAppVersion ??= resolveAppVersion();
  return cachedAppVersion;
}

export function resetAppVersionCacheForTests() {
  cachedAppVersion = null;
}
