import { spawn } from "node:child_process";
import { Client } from "pg";
import {
  parseNeonTarget,
  parseVerifiedConnection,
  requireValue,
  type NeonTarget,
} from "../../src/staging-seed/target.ts";

export async function command(args: string[], input?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn("flyctl", args, {
      stdio: ["pipe", "pipe", "pipe"],
      env: {
        PATH: process.env.PATH,
        HOME: process.env.HOME,
        FLY_API_TOKEN: process.env.FLY_API_TOKEN,
      },
    });
    let output = "";
    child.stdout.on("data", (chunk: Buffer) => {
      if (output.length < 1_000_000) output += chunk.toString();
    });
    child.stderr.resume(); // Provider diagnostics may contain secrets. Never forward them.
    child.on("error", () => reject(new Error("Fly command could not start.")));
    child.on("close", (code) =>
      code === 0 ? resolve(output) : reject(new Error("Fly operation failed.")),
    );
    child.stdin.on("error", () => {});
    child.stdin.end(input);
  });
}

export async function verifiedProvisioner(): Promise<{
  client: Client;
  target: NeonTarget;
  password: string;
}> {
  const target = parseNeonTarget(
    requireValue(process.env, "PREVIEW_DATABASE_TARGET"),
  );
  if (process.env.PGOPTIONS?.trim()) throw new Error("PGOPTIONS is forbidden.");
  const connection = parseVerifiedConnection(
    requireValue(process.env, "PREVIEW_DATABASE_ADMIN_URL"),
    target,
  );
  const client = new Client(connection);
  try {
    await client.connect();
    await verifyProvisionerServer(client, target);
    return { client, target, password: connection.password };
  } catch {
    await client.end();
    throw new Error("Preview provisioning target verification failed.");
  }
}

export async function verifyProvisionerServer(
  client: Pick<Client, "query">,
  target: NeonTarget,
): Promise<void> {
  const { rows } =
    await client.query(`SELECT current_setting('neon.project_id', true) AS "projectId",
      current_setting('neon.branch_id', true) AS "branchId", current_setting('neon.endpoint_id', true) AS "endpointId",
      current_database() AS database, current_user AS role`);
  if (
    rows.length !== 1 ||
    (["projectId", "branchId", "endpointId", "database", "role"] as const).some(
      (key) => !rows[0][key] || rows[0][key] !== target[key],
    )
  )
    throw new Error("Provisioning reached an unapproved server.");
  const permissions = await client.query(
    "SELECT rolcreatedb FROM pg_roles WHERE rolname = current_user",
  );
  if (permissions.rows.length !== 1 || permissions.rows[0].rolcreatedb !== true)
    throw new Error(
      "The nonproduction login must be able to create databases.",
    );
}

export function databaseUrl(target: NeonTarget, password: string): string {
  const url = new URL(
    `postgresql://${target.hostname}/${target.database}?sslmode=verify-full&channel_binding=require`,
  );
  url.username = target.role;
  url.password = password;
  return url.href;
}

/** flyctl 0.4.115 strips quote delimiters but does not JSON-unescape values. */
export function serializeFlySecrets(secrets: Record<string, string>): string {
  return (
    Object.entries(secrets)
      .map(([key, value]) => {
        const beforeComment = value.split("#", 1)[0];
        if (
          !/^[A-Z][A-Z0-9_]*$/.test(key) ||
          /[\r\n]/.test(value) ||
          value.includes('"""') ||
          (value.includes("#") &&
            (beforeComment.match(/"/g)?.length ?? 0) % 2 !== 0)
        )
          throw new Error(
            "A secret cannot be represented safely by the Fly import parser.",
          );
        return `${key}="""${value}"""`;
      })
      .join("\n") + "\n"
  );
}
