import type { AccountReturnProgress } from "./account-returns";

/** Retain completed rows across retries while the immutable calculation context agrees. */
export function mergeAccountReturnProgress(
  previous: AccountReturnProgress | undefined,
  next: AccountReturnProgress,
): AccountReturnProgress {
  if (!previous || previous.context !== next.context) return next;
  if (previous.workId === next.workId && next.sequence < previous.sequence)
    return previous;
  const rows = new Map(previous.rows.map((row) => [row.id, row]));
  for (const row of next.rows) rows.set(row.id, row);
  const totalResult = next.totalResult ?? previous.totalResult;
  return {
    ...next,
    rows: [...rows.values()],
    totalResult,
    completed: rows.size + Number(!!totalResult),
  };
}
