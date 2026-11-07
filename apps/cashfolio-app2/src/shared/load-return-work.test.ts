import { expect, it, vi } from "vitest";
import { loadCompleteReturnWork } from "./load-return-work";
import { ResourceLimitError } from "./resource-error";

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
