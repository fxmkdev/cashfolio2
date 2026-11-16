import { afterEach, describe, expect, test, vi } from "vitest";
import { runSecuritiesRefresh } from "../../scripts/run-securities-refresh";
import type {
  Machine,
  MachinesApi,
} from "../../scripts/run-provider-usage-cleanup";
const web: Machine = {
  id: "web",
  config: { metadata: { fly_process_group: "app" } },
  image_ref: {
    registry: "registry.fly.io",
    repository: "app",
    digest: "sha256:abc",
  },
};
function fixture(exit = 0) {
  let now = 0;
  const api = vi.fn<MachinesApi>(async (method, path) => {
    if (method === "GET" && path === "") return [web];
    if (method === "POST" && path === "") return { id: "job" };
    if (method === "GET")
      return {
        state: "stopped",
        events: [
          {
            timestamp: 1,
            request: {
              exit_event: {
                exit_code: exit,
                exited_at: "2026-11-16T04:17:00Z",
              },
            },
          },
        ],
      };
    return {};
  });
  return {
    api,
    region: "cdg",
    readLogs: vi.fn(async () =>
      JSON.stringify({
        message:
          'SECURITIES_REFRESH {"status":"completed","rows":1234,"pages":2,"version":"v"}',
      }),
    ),
    clock: () => now,
    sleep: vi.fn(async () => {
      now += 2000;
    }),
  };
}
afterEach(() => vi.restoreAllMocks());
describe("deployed securities refresh runner", () => {
  test("uses the deployed web image and always destroys the job after completion", async () => {
    const options = fixture();
    vi.spyOn(console, "log").mockImplementation(() => {});
    await runSecuritiesRefresh(options);
    expect(options.api).toHaveBeenCalledWith(
      "POST",
      "",
      expect.objectContaining({
        region: "cdg",
        config: expect.objectContaining({
          image: "registry.fly.io/app@sha256:abc",
          services: [],
          init: {
            exec: [
              "node",
              "/app/apps/cashfolio-app2/dist/securities-refresh/refresh.mjs",
            ],
          },
        }),
      }),
    );
    expect(options.api).toHaveBeenLastCalledWith("DELETE", "/job?force=true");
  });
  test("passes initialization mode and accepts only an available catalogue", async () => {
    const options = fixture();
    vi.spyOn(console, "log").mockImplementation(() => {});
    options.readLogs.mockResolvedValue(
      JSON.stringify({
        message:
          'SECURITIES_REFRESH {"status":"skipped","reason":"catalogue-present","rows":31,"pages":0,"version":"v"}',
      }),
    );
    await runSecuritiesRefresh({ ...options, onlyIfMissing: true });
    expect(options.api).toHaveBeenCalledWith(
      "POST",
      "",
      expect.objectContaining({
        config: expect.objectContaining({
          init: {
            exec: [
              "node",
              "/app/apps/cashfolio-app2/dist/securities-refresh/refresh.mjs",
              "--if-missing",
            ],
          },
        }),
      }),
    );
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining("no provider requests"),
    );
    expect(options.api).toHaveBeenLastCalledWith("DELETE", "/job?force=true");
  });
  test("initialization cannot succeed merely because another job holds the lock", async () => {
    const options = fixture();
    options.readLogs.mockResolvedValue(
      JSON.stringify({
        message:
          'SECURITIES_REFRESH {"status":"skipped","reason":"refresh-locked","rows":0,"pages":0,"version":null}',
      }),
    );
    await expect(
      runSecuritiesRefresh({ ...options, onlyIfMissing: true }),
    ).rejects.toThrow("without completion metrics");
    expect(options.api).toHaveBeenLastCalledWith("DELETE", "/job?force=true");
  });
  test("failed initialization is reported and its Machine is destroyed", async () => {
    const options = fixture(1);
    await expect(
      runSecuritiesRefresh({ ...options, onlyIfMissing: true }),
    ).rejects.toThrow("process failed");
    expect(options.api).toHaveBeenLastCalledWith("DELETE", "/job?force=true");
  });
  test("rejects nonzero exits and missing terminal metrics without printing remote logs", async () => {
    const failed = fixture(1);
    await expect(runSecuritiesRefresh(failed)).rejects.toThrow(
      "process failed",
    );
    expect(failed.api).toHaveBeenLastCalledWith("DELETE", "/job?force=true");
    const noMetrics = fixture();
    noMetrics.readLogs.mockResolvedValue(
      JSON.stringify({ message: "secret remote diagnostic" }),
    );
    await expect(runSecuritiesRefresh(noMetrics)).rejects.toThrow(
      "without completion metrics",
    );
    expect(noMetrics.readLogs).toHaveBeenCalledTimes(10);
    expect(noMetrics.api).toHaveBeenLastCalledWith("DELETE", "/job?force=true");
  });
  test("cleans up on cancellation and recovers an interrupted create by its unique name", async () => {
    const options = fixture();
    const controller = new AbortController();
    controller.abort();
    await expect(
      runSecuritiesRefresh({ ...options, signal: controller.signal }),
    ).rejects.toThrow("cancelled");
    expect(options.api).toHaveBeenLastCalledWith("DELETE", "/job?force=true");
    const lost = fixture();
    let name = "";
    lost.api.mockImplementation(async (method, path, body) => {
      if (method === "POST" && !path) {
        name = String(body!.name);
        throw new Error("response lost");
      }
      if (method === "GET" && !path)
        return [web, ...(name ? [{ id: "recovered", name }] : [])];
      return {};
    });
    await expect(runSecuritiesRefresh(lost)).rejects.toThrow("response lost");
    expect(lost.api).toHaveBeenLastCalledWith(
      "DELETE",
      "/recovered?force=true",
    );
  });
});
