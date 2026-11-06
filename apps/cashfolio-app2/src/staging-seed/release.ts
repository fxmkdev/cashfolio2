/** Keep orchestration explicit and testable; every failure stops the release. */
export async function runSeedRelease(steps: {
  verify: () => Promise<unknown>;
  migrate: () => Promise<unknown>;
  replace: () => Promise<string>;
}): Promise<string> {
  await steps.verify();
  await steps.migrate();
  return steps.replace();
}
