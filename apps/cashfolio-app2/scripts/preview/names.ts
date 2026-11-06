import { createHash } from "node:crypto";

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
export function previewNames(number: number, headRef: string) {
  prNumber(number);
  if (!headRef || /[\r\n\0]/.test(headRef))
    throw new Error("Invalid preview name inputs.");
  const prefix = `cashfolio-app2-pr-${number}-`;
  const tail = slug(headRef.split("/").at(-1)!, "branch");
  const flyApp = `${prefix}${truncate(slug(tail.replaceAll("github", "gh"), "branch"), 63 - prefix.length)}`;
  return {
    flyApp,
    previewUrl: `https://${flyApp}.fly.dev/`,
    hostname: `${flyApp}.fly.dev`,
  };
}
