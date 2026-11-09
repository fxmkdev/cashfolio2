import { matchesGlob } from "node:path";

type SuitePatterns = {
  include: string[];
  exclude?: string[];
};

// The general suite owns new domains by default; standalone tools retain their
// own database contracts, build prerequisites, and longer test timeouts.
export const integrationSuites = {
  mutations: {
    include: ["src/**/*.integration.ts"],
    exclude: [
      "src/staging-seed/**/*.integration.ts",
      "src/provider-usage-cleanup/**/*.integration.ts",
    ],
  },
  stagingSeed: { include: ["src/staging-seed/**/*.integration.ts"] },
  providerUsageCleanup: {
    include: ["src/provider-usage-cleanup/**/*.integration.ts"],
  },
} satisfies Record<string, SuitePatterns>;

export function integrationSuiteOwners(
  file: string,
  suites: Record<string, SuitePatterns> = integrationSuites,
): string[] {
  return Object.entries(suites)
    .filter(
      ([, { include, exclude = [] }]) =>
        include.some((pattern) => matchesGlob(file, pattern)) &&
        !exclude.some((pattern) => matchesGlob(file, pattern)),
    )
    .map(([name]) => name);
}
