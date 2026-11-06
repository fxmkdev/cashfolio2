import { setTimeout as pause } from "node:timers/promises";
import {
  validateNeonTarget,
  parseVerifiedConnection,
  requireValue,
  verifyNonproductionProject,
  type NeonTarget,
} from "../../src/staging-seed/target.ts";
import { databaseName, isManagedDatabase } from "./names.ts";

export interface Database {
  name: string;
  owner_name: string;
  branch_id: string;
  created_at: string;
}
interface Branch {
  id: string;
  project_id: string;
  default: boolean;
}
interface Endpoint {
  id: string;
  project_id: string;
  branch_id: string;
  host: string;
  type: string;
}
type Json = Record<string, unknown>;
class ApiError extends Error {
  status: number;
  constructor(status: number) {
    super(`Neon API request failed (${status}).`);
    this.status = status;
  }
}
export class Neon {
  readonly project: string;
  private key: string;
  private fetcher: typeof fetch;
  private sleep: (milliseconds: number) => Promise<unknown>;
  constructor(
    env: NodeJS.ProcessEnv,
    fetcher = fetch,
    sleep: (milliseconds: number) => Promise<unknown> = pause,
  ) {
    this.project = requireValue(env, "NEON_PROJECT_ID");
    verifyNonproductionProject(this.project, env);
    this.key = requireValue(env, "NEON_API_KEY");
    this.fetcher = fetcher;
    this.sleep = sleep;
  }
  async request(path: string, method = "GET", body?: unknown): Promise<Json> {
    for (let attempt = 0; ; attempt++) {
      let response: Response;
      try {
        response = await this.fetcher(
          `https://console.neon.tech/api/v2/projects/${this.project}${path}`,
          {
            method,
            headers: {
              Authorization: `Bearer ${this.key}`,
              "Content-Type": "application/json",
            },
            body: body === undefined ? undefined : JSON.stringify(body),
            signal: AbortSignal.timeout(30_000),
            redirect: "error",
          },
        );
      } catch {
        throw new ApiError(0);
      }
      if (
        method === "GET" &&
        [423, 503].includes(response.status) &&
        attempt < 4
      ) {
        await this.sleep(1000);
        continue;
      }
      if (!response.ok) throw new ApiError(response.status);
      try {
        const value: unknown = await response.json();
        if (!value || typeof value !== "object" || Array.isArray(value))
          throw new Error();
        return value as Json;
      } catch {
        throw new Error("Invalid Neon response.");
      }
    }
  }
  async list<T>(path: string, field: string, paginate = false): Promise<T[]> {
    const values: T[] = [];
    let cursor: string | undefined;
    const seen = new Set<string>();
    for (let page = 0; page < 100; page++) {
      const query = paginate
        ? `?limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`
        : "";
      const result = await this.request(path + query);
      if (!Array.isArray(result[field]))
        throw new Error("Incomplete Neon inventory.");
      values.push(...(result[field] as T[]));
      const pagination = result.pagination as { next?: unknown } | undefined;
      if (pagination?.next === undefined || pagination.next === null)
        return values;
      if (
        !paginate ||
        typeof pagination.next !== "string" ||
        !pagination.next ||
        seen.has(pagination.next)
      )
        throw new Error("Invalid Neon pagination.");
      cursor = pagination.next;
      seen.add(cursor);
    }
    throw new Error("Incomplete Neon inventory.");
  }
  async discover() {
    const branches = await this.list<Branch>("/branches", "branches", true);
    if (
      branches.some(
        (b) => b.project_id !== this.project || !/^br-[a-z0-9-]+$/.test(b.id),
      )
    )
      throw new Error("Unexpected Neon branch inventory.");
    const defaults = branches.filter((b) => b.default === true);
    if (defaults.length !== 1)
      throw new Error("One default Neon branch is required.");
    const branch = defaults[0];
    const endpoints = await this.list<Endpoint>(
      `/branches/${branch.id}/endpoints`,
      "endpoints",
    );
    if (
      endpoints.some(
        (e) => e.project_id !== this.project || e.branch_id !== branch.id,
      )
    )
      throw new Error("Unexpected Neon endpoint inventory.");
    const writers = endpoints.filter((e) => e.type === "read_write");
    if (writers.length !== 1)
      throw new Error("One read-write Neon endpoint is required.");
    const databases = await this.databases(branch.id);
    const owners = [
      ...new Set(
        databases
          .filter(
            (d) => !["postgres", "template0", "template1"].includes(d.name),
          )
          .map((d) => d.owner_name),
      ),
    ];
    if (owners.length !== 1)
      throw new Error("One existing application database owner is required.");
    const endpoint = writers[0];
    const target = validateNeonTarget({
      hostname: endpoint.host,
      endpointId: endpoint.id,
      projectId: this.project,
      branchId: branch.id,
      database: databases.find((d) => d.owner_name === owners[0])!.name,
      role: owners[0],
    });
    return { target, databases };
  }
  async databases(branch: string): Promise<Database[]> {
    if (!/^br-[a-z0-9-]+$/.test(branch))
      throw new Error("Invalid Neon branch.");
    const databases = await this.list<Database>(
      `/branches/${branch}/databases`,
      "databases",
    );
    if (
      databases.some(
        (d) =>
          d.branch_id !== branch ||
          typeof d.name !== "string" ||
          typeof d.owner_name !== "string" ||
          typeof d.created_at !== "string" ||
          !Number.isFinite(Date.parse(d.created_at)),
      )
    )
      throw new Error("Invalid Neon database inventory.");
    return databases;
  }
  async wait(operations: unknown) {
    if (!Array.isArray(operations)) throw new Error("Missing Neon operations.");
    for (const initial of operations) {
      if (
        !initial ||
        typeof initial.id !== "string" ||
        !/^[a-zA-Z0-9-]+$/.test(initial.id) ||
        initial.project_id !== this.project
      )
        throw new Error("Invalid Neon operation.");
      let operation = initial;
      for (let attempt = 0; ; attempt++) {
        if (
          operation.project_id !== this.project ||
          operation.id !== initial.id
        )
          throw new Error("Unexpected Neon operation project.");
        if (operation.status === "finished" || operation.status === "skipped")
          break;
        if (
          !["scheduling", "running"].includes(operation.status) ||
          attempt >= 60
        )
          throw new Error("Neon operation failed or timed out.");
        await this.sleep(1000);
        operation = (
          await this.request(`/operations/${encodeURIComponent(initial.id)}`)
        ).operation;
        if (!operation || typeof operation !== "object")
          throw new Error("Invalid Neon operation response.");
      }
    }
  }
  async ensure(context: Awaited<ReturnType<Neon["discover"]>>, branch: string) {
    const name = databaseName(branch);
    const base = context.target;
    const matches = (databases: Database[]) =>
      databases.filter((d) => d.name === name);
    let existing = matches(context.databases);
    if (!existing.length) {
      let created: Json;
      try {
        created = await this.request(
          `/branches/${base.branchId}/databases`,
          "POST",
          { database: { name, owner_name: base.role } },
        );
      } catch (error) {
        // A lost response or another creator can leave the exact database in place.
        if (
          !(error instanceof ApiError) ||
          ![0, 409, 423, 503].includes(error.status)
        )
          throw error;
        existing = matches(await this.databases(base.branchId));
        if (!existing.length)
          throw new Error(
            "Neon database creation failed; retry the deployment.",
            { cause: error },
          );
        created = { operations: [] };
      }
      await this.wait(created.operations);
      existing = matches(await this.databases(base.branchId));
    }
    if (existing.length !== 1 || existing[0].owner_name !== base.role)
      throw new Error("Unexpected Neon database ownership.");
    const target: NeonTarget = { ...base, database: name };
    const query = new URLSearchParams({
      branch_id: base.branchId,
      endpoint_id: base.endpointId,
      database_name: name,
      role_name: base.role,
      pooled: "false",
    });
    const result = await this.request(`/connection_uri?${query}`);
    let url: URL;
    try {
      if (typeof result.uri !== "string") throw new Error();
      url = new URL(result.uri);
    } catch {
      throw new Error("Invalid Neon connection response.");
    }
    // Validate API-supplied routing and duplicate options before normalizing TLS.
    parseVerifiedConnection(url.href, target, true);
    url.searchParams.set("sslmode", "verify-full");
    url.searchParams.set("channel_binding", "require");
    parseVerifiedConnection(url.href, target);
    return { target, databaseUrl: url.href };
  }
  async deleteDatabase(target: NeonTarget, database: Database) {
    if (
      database.branch_id !== target.branchId ||
      database.owner_name !== target.role ||
      !isManagedDatabase(database.name)
    )
      throw new Error("Refusing to delete an unmanaged database.");
    let result: Json;
    try {
      result = await this.request(
        `/branches/${target.branchId}/databases/${encodeURIComponent(database.name)}`,
        "DELETE",
      );
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) return;
      throw error;
    }
    await this.wait(result.operations);
  }
}
