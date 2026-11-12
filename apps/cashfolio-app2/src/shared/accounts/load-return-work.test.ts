import { expect, it, vi } from "vitest";
import { loadCompleteReturnWork } from "./load-return-work";
import { ResourceLimitError } from "../resources/resource-error";

it("continues pending batches and publishes only the final result", async () => {
  const fetch = vi
    .fn()
    .mockResolvedValueOnce({ status: "pending", continuation: "one" })
    .mockResolvedValueOnce({ status: "pending", continuation: "two" })
    .mockResolvedValue({ status: "complete", data: 42 });
  expect(await loadCompleteReturnWork(fetch)).toBe(42);
  expect(fetch.mock.calls).toEqual([
    [undefined, 128],
    ["one", 128],
    ["two", 128],
  ]);
});
it("automatically halves workload on resource errors while retaining the continuation", async () => {
  const fetch = vi
    .fn()
    .mockResolvedValueOnce({ status: "pending", continuation: "job" })
    .mockRejectedValueOnce(
      new ResourceLimitError("Limit", 429, 0, "provider_request_limit"),
    )
    .mockRejectedValueOnce(
      new ResourceLimitError("Limit", 503, 0, "read_deadline"),
    )
    .mockResolvedValue({ status: "complete", data: 42 });
  expect(await loadCompleteReturnWork(fetch)).toBe(42);
  expect(fetch.mock.calls).toEqual([
    [undefined, 128],
    ["job", 128],
    ["job", 64],
    ["job", 32],
  ]);
});
it("bounds retries and does not retry unrelated failures", async () => {
  const fetch = vi
    .fn()
    .mockResolvedValueOnce({ status: "pending", continuation: "job" })
    .mockRejectedValue(
      new ResourceLimitError("Limit", 503, 0, "read_deadline"),
    );
  await expect(loadCompleteReturnWork(fetch)).rejects.toThrow("Limit");
  expect(fetch).toHaveBeenLastCalledWith("job", 1);
  const unrelated = vi.fn().mockRejectedValue(new Error("Unexpected"));
  await expect(loadCompleteReturnWork(unrelated)).rejects.toThrow("Unexpected");
  expect(unrelated).toHaveBeenCalledTimes(1);
});
it("starts fresh after invalidation but bounds repeated restarts", async () => {
  const fetch = vi
    .fn()
    .mockResolvedValueOnce({ status: "pending", continuation: "old" })
    .mockResolvedValueOnce({ status: "restart" })
    .mockResolvedValueOnce({ status: "complete", data: "new" });
  expect(await loadCompleteReturnWork(fetch)).toBe("new");
  expect(fetch.mock.calls[2]).toEqual([undefined, 128]);
  await expect(
    loadCompleteReturnWork(vi.fn().mockResolvedValue({ status: "restart" })),
  ).rejects.toThrow("changed repeatedly");
});
it("stops after a superseding scope or ledger date change, even when the in-flight request resolves", async () => {
  const controller = new AbortController();
  const fetch = vi.fn(async () => {
    controller.abort();
    return { status: "pending" as const, continuation: "old" };
  });
  await expect(
    loadCompleteReturnWork(fetch, controller.signal),
  ).rejects.toThrow();
  expect(fetch).toHaveBeenCalledTimes(1);
});
it("publishes monotonic progress and clears it when the immutable context changes", async () => {
  const base = {
    context: "old",
    workId: "job",
    revision: "r1",
    sequence: 2,
    phase: "history" as const,
    completed: 1,
    total: 2,
    referenceCurrency: "CHF",
    startDate: "2026-01-01",
    asOfDate: "2026-11-07",
    publication: "2026-11-06",
    rows: [],
  };
  const progress = vi.fn();
  const request = vi
    .fn()
    .mockResolvedValueOnce({
      status: "pending",
      continuation: "job",
      progress: base,
    })
    .mockResolvedValueOnce({
      status: "pending",
      continuation: "job",
      progress: { ...base, sequence: 1 },
    })
    .mockResolvedValueOnce({
      status: "complete",
      data: 42,
      progress: { ...base, context: "new", workId: "new-job", sequence: 0 },
    });
  expect(await loadCompleteReturnWork(request, undefined, progress)).toBe(42);
  expect(progress.mock.calls.map(([p]) => p?.context)).toEqual([
    "old",
    undefined,
    "new",
  ]);
});
it("cancels a pending batch delay without issuing another request", async () => {
  const controller = new AbortController();
  const request = vi.fn().mockResolvedValue({
    status: "pending",
    continuation: "job",
    retryAfterMs: 1000,
  });
  const promise = loadCompleteReturnWork(request, controller.signal);
  await Promise.resolve();
  controller.abort();
  await expect(promise).rejects.toThrow();
  expect(request).toHaveBeenCalledOnce();
});
