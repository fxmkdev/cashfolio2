import { command } from "../preview/runtime.ts";
import { previewAppNumber, type App, type Machine } from "./cleanup.ts";

export async function flyInventory(
  stagingApp: string,
  run = command,
): Promise<App[]> {
  if (!/^[a-z0-9-]{1,63}$/.test(stagingApp) || previewAppNumber(stagingApp))
    throw new Error("Staging app configuration is required.");
  const inventory: unknown = JSON.parse(await run(["apps", "list", "--json"]));
  if (!Array.isArray(inventory))
    throw new Error("Incomplete Fly app inventory.");
  const apps: App[] = [];
  for (const value of inventory) {
    const name = value?.Name ?? value?.name;
    if (typeof name !== "string") throw new Error("Invalid Fly app inventory.");
    if (name !== stagingApp && !previewAppNumber(name)) continue;
    const machines: unknown = JSON.parse(
      await run(["machines", "list", "--app", name, "--json"]),
    );
    if (
      !Array.isArray(machines) ||
      machines.some(
        (m) =>
          !m ||
          typeof m.state !== "string" ||
          !m.config ||
          typeof m.config !== "object",
      )
    )
      throw new Error("Incomplete Fly machine inventory.");
    apps.push({ name, machines: machines as Machine[] });
  }
  if (!apps.some((app) => app.name === stagingApp))
    throw new Error("Staging is missing from the Fly inventory.");
  return apps;
}
export async function healthyPreview(url: string) {
  try {
    const response = await fetch(url, {
      redirect: "manual",
      signal: AbortSignal.timeout(10_000),
    });
    await response.body?.cancel();
    return response.status >= 200 && response.status < 400;
  } catch {
    return false;
  }
}
