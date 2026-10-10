import { beforeEach, describe, expect, it, vi } from "vitest";

const tx = vi.hoisted(() => ({ $queryRaw: vi.fn() }));
const prisma = vi.hoisted(() => ({ $transaction: vi.fn() }));
vi.mock("../prisma.server", () => ({ prisma }));

import { withAccountBookMutation } from "./account-book-mutation.server";

describe("withAccountBookMutation", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    prisma.$transaction.mockImplementation(async (callback) => callback(tx));
  });

  it("waits for the book lock before invoking the operation", async () => {
    let release!: (books: { id: string }[]) => void;
    tx.$queryRaw.mockReturnValue(
      new Promise((resolve) => {
        release = resolve;
      }),
    );
    const operation = vi.fn().mockResolvedValue("committed result");
    const result = withAccountBookMutation("book-1", operation);

    expect(operation).not.toHaveBeenCalled();
    release([{ id: "book-1" }]);
    await expect(result).resolves.toBe("committed result");
    expect(operation).toHaveBeenCalledWith(tx);
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: "ReadCommitted",
      timeout: 30_000,
    });
    expect(tx.$queryRaw.mock.calls[0][1]).toBe("book-1");
  });

  it("refuses to run an operation for a book deleted while waiting", async () => {
    tx.$queryRaw.mockResolvedValue([]);
    const operation = vi.fn();
    await expect(withAccountBookMutation("missing", operation)).rejects.toThrow(
      "Account book was not found.",
    );
    expect(operation).not.toHaveBeenCalled();
  });

  it("propagates lock failure without running the operation", async () => {
    tx.$queryRaw.mockRejectedValue(new Error("lock failed"));
    const operation = vi.fn();
    await expect(withAccountBookMutation("book-1", operation)).rejects.toThrow(
      "lock failed",
    );
    expect(operation).not.toHaveBeenCalled();
  });
});
