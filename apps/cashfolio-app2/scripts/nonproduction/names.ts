import { createHash } from "node:crypto";

export function databaseName(branch: string): string {
  if (!branch || /[\r\n\0]/.test(branch))
    throw new Error("Invalid source branch.");
  const slug =
    branch
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "branch";
  const hash = createHash("sha256").update(branch).digest("hex").slice(0, 8);
  return `cashfolio-app2-${slug.slice(0, 39).replace(/-+$/, "")}-${hash}`;
}
export function isManagedDatabase(name: string): boolean {
  return (
    name.length <= 63 &&
    /^cashfolio-app2-[a-z0-9]+(?:-[a-z0-9]+)*-[a-f0-9]{8}$/.test(name)
  );
}
