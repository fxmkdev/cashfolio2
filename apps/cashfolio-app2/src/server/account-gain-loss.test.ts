import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  authorize: vi.fn(),
  summaries: vi.fn(),
  details: vi.fn(),
}));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => ({
    validator: (validate: (input: unknown) => unknown) => ({
      handler:
        (handle: (args: { data: unknown }) => unknown) =>
        (args: { data: unknown }) =>
          handle({ data: validate(args.data) }),
    }),
  }),
}));
vi.mock("../account-books/functions.server", () => ({
  ensureAuthorizedForAccountBookId: mocks.authorize,
}));
vi.mock("./accounts/account-gain-loss.server", () => ({
  queryAccountGainLossSummaries: mocks.summaries,
  queryAccountGainLoss: mocks.details,
}));
import {
  getAccountGainLoss,
  getAccountGainLossSummaries,
} from "./account-gain-loss";
beforeEach(() => {
  vi.clearAllMocks();
  mocks.authorize.mockResolvedValue(undefined);
});
it("authorizes list summaries and details before querying", async () => {
  await getAccountGainLossSummaries({
    data: { accountBookId: "book", type: "ASSET", accountState: "active" },
  });
  await getAccountGainLoss({
    data: { accountBookId: "book", accountId: "a", includeDetails: true },
  });
  expect(mocks.authorize).toHaveBeenCalledTimes(2);
  expect(mocks.authorize).toHaveBeenCalledWith("book");
  expect(mocks.summaries).toHaveBeenCalledTimes(1);
  expect(mocks.details).toHaveBeenCalledTimes(1);
});
it("never queries an unauthorized book", async () => {
  mocks.authorize.mockRejectedValue(new Error("Unauthorized"));
  await expect(
    getAccountGainLoss({ data: { accountBookId: "other", accountId: "a" } }),
  ).rejects.toThrow("Unauthorized");
  expect(mocks.details).not.toHaveBeenCalled();
});
it("authorizes and forwards the unified account scope", async () => {
  const data = {
    accountBookId: "book",
    type: "ASSET" as const,
    accountState: "all" as const,
  };
  await getAccountGainLossSummaries({ data });
  expect(mocks.authorize).toHaveBeenCalledWith("book");
  expect(mocks.summaries).toHaveBeenCalledWith(data);
});
it("rejects invalid list scopes", () => {
  expect(() =>
    getAccountGainLossSummaries({
      data: {
        accountBookId: "book",
        type: "EQUITY" as "ASSET",
        accountState: "active",
      },
    }),
  ).toThrow("Invalid account G/L scope");
  expect(() =>
    getAccountGainLossSummaries({
      data: {
        accountBookId: "book",
        type: "ASSET",
        accountState: "invalid" as "active",
      },
    }),
  ).toThrow("Invalid account G/L scope");
});
