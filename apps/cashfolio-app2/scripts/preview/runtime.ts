import { spawn } from "node:child_process";
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

export function maskSecrets(values: string[]) {
  for (const value of values) {
    console.log(
      `::add-mask::${value.replaceAll("%", "%25").replaceAll("\r", "%0D").replaceAll("\n", "%0A")}`,
    );
  }
}

export async function stageFlySecrets(
  flyApp: string,
  secrets: Record<string, string>,
  run = command,
) {
  const input = serializeFlySecrets(secrets);
  maskSecrets([
    ...Object.values(secrets),
    ...["SEED_USER_EXTERNAL_IDS", "SEED_ADMIN_EXTERNAL_IDS"].flatMap(
      (key) => secrets[key]?.split(",") ?? [],
    ),
  ]);
  await run(["secrets", "import", "--app", flyApp, "--stage"], input);
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
