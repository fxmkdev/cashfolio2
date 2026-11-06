import { databaseName, isManagedDatabase } from "./names.ts";
import type { Database } from "./neon.ts";
import type { NeonTarget } from "../../src/staging-seed/target.ts";
import { previewNames } from "../preview/names.ts";
import { validatePr, type PullRequest } from "../preview/github.ts";

export interface Machine {
  state: string;
  config: { env?: Record<string, string> };
}
export interface App {
  name: string;
  machines: Machine[];
}
export type Request = <T>(path: string) => Promise<T>;

export async function openPullRequests(api: Request, repository: string) {
  const prs: PullRequest[] = [];
  for (let page = 1; page <= 100; page++) {
    const batch = await api<PullRequest[]>(
      `/pulls?state=open&per_page=100&page=${page}`,
    );
    if (!Array.isArray(batch)) throw new Error("Incomplete GitHub inventory.");
    for (const pr of batch) {
      if (pr.head?.repo?.full_name !== repository || pr.head.repo.fork)
        continue;
      validatePr(pr, repository);
      prs.push(pr);
    }
    if (batch.length < 100) return prs;
  }
  throw new Error("Incomplete GitHub inventory.");
}
export function previewAppNumber(name: string) {
  const match = /^cashfolio-app2-pr-([1-9][0-9]*)(?:-[a-z0-9-]+)?$/.exec(name);
  return match ? Number(match[1]) : undefined;
}
export function hasCurrentDeployment(
  app: App,
  pr: PullRequest,
  target: NeonTarget,
) {
  return (
    app.name === previewNames(pr.number, pr.head.ref).flyApp &&
    app.machines.some((machine) => {
      const env = machine.config.env;
      return (
        ["started", "stopped", "suspended"].includes(machine.state) &&
        env?.APP_ENVIRONMENT === "preview" &&
        env.CASHFOLIO_DATABASE_PROJECT_ID === target.projectId &&
        env.CASHFOLIO_DATABASE_BRANCH_ID === target.branchId &&
        env.CASHFOLIO_DATABASE_NAME === databaseName(pr.head.ref) &&
        env.CASHFOLIO_DEPLOY_SHA === pr.head.sha
      );
    })
  );
}
export async function appsToRetire(
  apps: App[],
  prs: PullRequest[],
  target: NeonTarget,
  healthy: (url: string) => Promise<boolean>,
) {
  const retired: string[] = [];
  const ready = new Map<number, boolean>();
  for (const app of apps) {
    const number = previewAppNumber(app.name);
    if (!number) continue; // Staging and unrelated apps are never retired.
    const pr = prs.find((pr) => pr.number === number);
    if (!pr) {
      retired.push(app.name);
      continue;
    }
    const names = previewNames(pr.number, pr.head.ref);
    if (app.name === names.flyApp) continue;
    if (!ready.has(number)) {
      const current = apps.find((app) => app.name === names.flyApp);
      ready.set(
        number,
        Boolean(
          current &&
          hasCurrentDeployment(current, pr, target) &&
          (await healthy(names.previewUrl)),
        ),
      );
    }
    if (ready.get(number)) retired.push(app.name);
  }
  return retired;
}

export function databasesToDelete(input: {
  databases: Database[];
  apps: App[];
  prs: PullRequest[];
  defaultBranch: string;
  target: NeonTarget;
  now: number;
}) {
  const retained = new Set([
    databaseName(input.defaultBranch),
    ...input.prs.map((pr) => databaseName(pr.head.ref)),
  ]);
  for (const app of input.apps) {
    for (const machine of app.machines) {
      if (machine.state === "destroyed") continue;
      const env = machine.config.env;
      if (
        !env ||
        !["staging", "preview"].includes(env.APP_ENVIRONMENT) ||
        env.CASHFOLIO_DATABASE_PROJECT_ID !== input.target.projectId ||
        !/^br-[a-z0-9-]+$/.test(env.CASHFOLIO_DATABASE_BRANCH_ID ?? "") ||
        !isManagedDatabase(env.CASHFOLIO_DATABASE_NAME ?? "") ||
        !/^[a-f0-9]{40}$/.test(env.CASHFOLIO_DEPLOY_SHA ?? "")
      )
        throw new Error(
          "Incomplete deployed database inventory; no databases will be deleted.",
        );
      if (env.CASHFOLIO_DATABASE_BRANCH_ID === input.target.branchId)
        retained.add(env.CASHFOLIO_DATABASE_NAME);
    }
  }
  // Validate the complete inventory before the caller performs any deletion.
  for (const db of input.databases) {
    if (
      db.branch_id !== input.target.branchId ||
      !Number.isFinite(Date.parse(db.created_at)) ||
      (isManagedDatabase(db.name) && db.owner_name !== input.target.role)
    )
      throw new Error(
        "Unexpected database inventory; no databases will be deleted.",
      );
  }
  return input.databases.filter(
    (db) =>
      isManagedDatabase(db.name) &&
      !retained.has(db.name) &&
      input.now - Date.parse(db.created_at) >= 86_400_000,
  );
}

export async function sweep(deps: {
  prs: PullRequest[];
  defaultBranch: string;
  now: number;
  neon: Pick<
    import("./neon.ts").Neon,
    "discover" | "databases" | "deleteDatabase"
  >;
  inventory: () => Promise<App[]>;
  retire: (name: string) => Promise<unknown>;
  healthy: (url: string) => Promise<boolean>;
}) {
  const context = await deps.neon.discover();
  const retired = await appsToRetire(
    await deps.inventory(),
    deps.prs,
    context.target,
    deps.healthy,
  );
  for (const name of retired) await deps.retire(name);
  const remaining = await deps.inventory();
  const candidates = databasesToDelete({
    databases: await deps.neon.databases(context.target.branchId),
    apps: remaining,
    prs: deps.prs,
    defaultBranch: deps.defaultBranch,
    target: context.target,
    now: deps.now,
  });
  for (const db of candidates)
    await deps.neon.deleteDatabase(context.target, db);
  return { apps: retired.length, databases: candidates.length };
}
