import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { PrismaClient } from "../.prisma-client/client";
import { refreshCatalogue } from "./refresh.server";
import { readRefreshArguments } from "./options";

const findFirst = vi.fn();
const query = vi.fn();
const create = vi.fn();
const transaction = vi.fn(
  async (operation: (lock: { $queryRaw: typeof query }) => unknown) =>
    operation({ $queryRaw: query }),
);
const db = {
  $transaction: transaction,
  securityCatalogueSnapshot: { findFirst, create },
} as unknown as PrismaClient;
const existing = {
  id: "published-version",
  rowCount: 31,
  publishedAt: new Date("2000-01-01"),
  expiresAt: null,
};
beforeEach(() => {
  vi.clearAllMocks();
  findFirst.mockResolvedValue(null);
  query.mockResolvedValue([{ locked: true }]);
});
afterEach(() => vi.unstubAllEnvs());

describe("catalogue initialization", () => {
  test("skips existing, even stale catalogues without requiring provider credentials", async () => {
    vi.stubEnv("MARKETSTACK_API_KEY", undefined);
    findFirst.mockResolvedValue(existing);
    const prepare = vi.fn();
    const fetchPage = vi.fn();
    expect(
      await refreshCatalogue(db, { onlyIfMissing: true, prepare, fetchPage }),
    ).toEqual({
      status: "skipped",
      reason: "catalogue-present",
      version: existing.id,
      rows: 31,
      pages: 0,
    });
    expect(transaction).not.toHaveBeenCalled();
    expect(prepare).not.toHaveBeenCalled();
    expect(fetchPage).not.toHaveBeenCalled();
  });
  test("rechecks publication after acquiring the lock before any preflight", async () => {
    findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(existing);
    const prepare = vi.fn();
    expect(
      await refreshCatalogue(db, { onlyIfMissing: true, prepare }),
    ).toMatchObject({ reason: "catalogue-present", version: existing.id });
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(prepare).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });
  test("waits for another initializer to publish rather than reporting premature success", async () => {
    query.mockResolvedValue([{ locked: false }]);
    findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(existing);
    const prepare = vi.fn();
    expect(
      await refreshCatalogue(db, { onlyIfMissing: true, prepare }),
    ).toMatchObject({ reason: "catalogue-present", version: existing.id });
    expect(prepare).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });
  test("takes over after a competing job releases its lock without a catalogue", async () => {
    query
      .mockResolvedValueOnce([{ locked: false }])
      .mockResolvedValueOnce([{ locked: true }]);
    const error = new Error("provider preflight failed");
    const prepare = vi.fn().mockRejectedValue(error);
    await expect(
      refreshCatalogue(db, { onlyIfMissing: true, prepare }),
    ).rejects.toBe(error);
    expect(query).toHaveBeenCalledTimes(2);
    expect(prepare).toHaveBeenCalledTimes(1);
    expect(create).not.toHaveBeenCalled();
  });
  test("cancels a wait without publishing or claiming a ready catalogue", async () => {
    const controller = new AbortController();
    let locked!: () => void;
    const ready = new Promise<void>((resolve) => {
      locked = resolve;
    });
    query.mockImplementationOnce(async () => {
      locked();
      return [{ locked: false }];
    });
    const error = new Error("deadline reached");
    const prepare = vi.fn();
    const operation = refreshCatalogue(db, {
      onlyIfMissing: true,
      signal: controller.signal,
      prepare,
    });
    const check = expect(operation).rejects.toMatchObject({
      name: "AbortError",
    });
    await ready;
    controller.abort(error);
    await check;
    expect(prepare).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });
  test("normal refreshes retain nonblocking lock behavior", async () => {
    query.mockResolvedValue([{ locked: false }]);
    const prepare = vi.fn();
    expect(await refreshCatalogue(db, { prepare })).toMatchObject({
      status: "skipped",
      reason: "refresh-locked",
      version: null,
    });
    expect(findFirst).not.toHaveBeenCalled();
    expect(prepare).not.toHaveBeenCalled();
  });
  test("accepts only the documented CLI modes", () => {
    expect(readRefreshArguments([])).toEqual({
      smoke: false,
      onlyIfMissing: false,
    });
    expect(readRefreshArguments(["--if-missing"])).toEqual({
      smoke: false,
      onlyIfMissing: true,
    });
    expect(readRefreshArguments(["--smoke"])).toEqual({
      smoke: true,
      onlyIfMissing: false,
    });
    for (const args of [
      ["--if-missing", "--smoke"],
      ["--if-missing", "--if-missing"],
      ["--unknown"],
    ])
      expect(() => readRefreshArguments(args)).toThrow();
  });
});
