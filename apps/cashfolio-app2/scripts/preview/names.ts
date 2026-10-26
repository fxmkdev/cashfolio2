import { createHash } from "node:crypto";
import { appendFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

export function prNumber(value: unknown): number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < 1 ||
    value > 999_999_999
  )
    throw new Error("Invalid PR number.");
  return value;
}

function slug(value: string, fallback: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "") || fallback
  );
}
function truncate(value: string, length: number): string {
  if (value.length <= length) return value;
  const hash = createHash("sha1").update(value).digest("hex").slice(0, 6);
  return `${value.slice(0, length - 7).replace(/-+$/, "") || "b"}-${hash}`;
}
export function previewNames(number: number, headRef: string, title: string) {
  prNumber(number);
  if (!headRef || !title || /[\r\n\0]/.test(headRef + title))
    throw new Error("Invalid preview name inputs.");
  const prefix = `cashfolio-app2-pr-${number}-`;
  const tail = slug(headRef.split("/").at(-1)!, "branch");
  const flyApp = `${prefix}${truncate(slug(tail.replaceAll("github", "gh"), "branch"), 63 - prefix.length)}`;
  const databasePrefix = `pr-${number}-`;
  const databaseSuffix = "-cashfolio-app2";
  const database = `${databasePrefix}${truncate(slug(title, "preview"), 63 - databasePrefix.length - databaseSuffix.length)}${databaseSuffix}`;
  return {
    flyApp,
    flyAppLegacy: `cashfolio-app2-pr-${number}`,
    previewUrl: `https://${flyApp}.fly.dev/`,
    hostname: `${flyApp}.fly.dev`,
    database,
    appRole: `cashfolio_pr_${number}_app`,
    seedRole: `cashfolio_pr_${number}_seed`,
  };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const names = previewNames(
    Number(process.env.PR_NUMBER),
    process.env.HEAD_REF ?? "",
    process.env.PR_TITLE ?? "",
  );
  if (!process.env.GITHUB_OUTPUT) throw new Error("GITHUB_OUTPUT is required.");
  await appendFile(
    process.env.GITHUB_OUTPUT,
    Object.entries({
      fly_app: names.flyApp,
      fly_app_legacy: names.flyAppLegacy,
      preview_url: names.previewUrl,
      preview_hostname: names.hostname,
      database_name: names.database,
    })
      .map(([key, value]) => `${key}=${value}\n`)
      .join(""),
  );
}
