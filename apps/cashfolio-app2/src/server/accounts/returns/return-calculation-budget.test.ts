import { beforeEach, expect, it, vi } from "vitest";
import { ResourceLimitError } from "../../resource-error";
const solver = vi.hoisted(() => vi.fn());
vi.mock("./return-irr", () => ({ calculateMoneyWeightedReturn: solver }));
import { returns } from "./return-test-support";
beforeEach(() => {
  solver.mockReset();
});
it("retains TWR when MWR exceeds its deterministic solver workload", async () => {
  solver.mockImplementation(() => {
    throw new Error(
      "Money-weighted return is too complex to resolve uniquely.",
    );
  });
  const { result } = await returns({ initial: { a: "100" } });
  expect(result.twr).toBe(0);
  expect(result.mwr).toBeNull();
  expect(result.diagnostics).toEqual([
    {
      metric: "mwr",
      message: "Money-weighted return is too complex to resolve uniquely.",
    },
  ]);
});
it("propagates request cancellation instead of disguising it as a missing metric", async () => {
  const cancelled = new ResourceLimitError("Cancelled", 503, 0, "cancelled");
  solver.mockImplementation(() => {
    throw cancelled;
  });
  await expect(returns({ initial: { a: "100" } })).rejects.toBe(cancelled);
});
