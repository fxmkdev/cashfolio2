import { expect, it } from "vitest";
import { mergeAccountReturnProgress } from "./account-return-progress";
import {
  emptyAccountReturnResult,
  type AccountReturnProgress,
} from "./account-returns";
const progress = (sequence: number, ids: string[]): AccountReturnProgress => ({
  context: "context",
  workId: "work",
  revision: "r1",
  sequence,
  phase: "calculation",
  completed: ids.length,
  total: 5,
  referenceCurrency: "CHF",
  startDate: "2026-01-01",
  asOfDate: "2026-11-07",
  publication: "2026-11-06",
  rows: ids.map((id) => ({ id, ...emptyAccountReturnResult() })),
});
it("merges by displayed ID across resumptions and a retry in the same context", () => {
  const first = {
    ...progress(3, ["a", "group"]),
    totalResult: emptyAccountReturnResult(),
  };
  const next = mergeAccountReturnProgress(first, {
    ...progress(0, ["b"]),
    workId: "retry",
  });
  expect(next.rows.map((r) => r.id)).toEqual(["a", "group", "b"]);
  expect(next.totalResult).toEqual(first.totalResult);
  expect(next.completed).toBe(4);
  const updated = mergeAccountReturnProgress(next, {
    ...progress(1, ["a"]),
    workId: "retry",
    rows: [{ id: "a", ...emptyAccountReturnResult(), twr: 0.1 }],
  });
  expect(updated.rows.find((r) => r.id === "a")?.twr).toBe(0.1);
});
it("rejects older sequences and clears previous rows for a changed revision/date/scope context", () => {
  const previous = progress(3, ["a"]);
  expect(mergeAccountReturnProgress(previous, progress(2, ["b"]))).toBe(
    previous,
  );
  const fresh = { ...progress(0, ["new"]), context: "new-context" };
  expect(mergeAccountReturnProgress(previous, fresh)).toBe(fresh);
});
