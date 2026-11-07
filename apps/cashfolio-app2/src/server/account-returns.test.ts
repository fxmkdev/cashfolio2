import { beforeEach, expect, it, vi } from "vitest";
import { emptyAccountReturnResult } from "../shared/account-returns";
import {
  unitRowId,
  assetClassRowId,
  archivedClassRowId,
} from "../shared/account-return-groups";
const mocks = vi.hoisted(() => ({
  authorize: vi.fn(),
  work: vi.fn(),
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
vi.mock("./accounts/returns/account-returns.server", () => ({
  queryAccountReturnWork: mocks.work,
}));
import {
  getAccountReturnSummaries,
  getAccountReturnDetails,
} from "./account-returns";
const scope = {
  accountBookId: "book",
  accountState: "all" as const,
  grouping: "accountStructure" as const,
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.authorize.mockResolvedValue({ userId: "user" });
  mocks.work.mockImplementation(async (args) =>
    args.target
      ? {
          status: "complete",
          data: {
            ...emptyAccountReturnResult(),
            valuations: args.includeDetails ? [{ id: "valuation" }] : [],
            cashFlows: [],
          },
        }
      : {
          status: "complete",
          data: { rows: [], total: emptyAccountReturnResult() },
        },
  );
});
it("authorizes summaries and account/group/total calculations before reading financial data", async () => {
  await getAccountReturnSummaries({ data: scope });
  for (const target of [
    { kind: "account" as const, id: "a" },
    { kind: "group" as const, id: "g" },
    { kind: "total" as const },
  ])
    await getAccountReturnDetails({
      data: { ...scope, target, includeDetails: true },
    });
  expect(mocks.authorize).toHaveBeenCalledTimes(4);
  expect(mocks.work).toHaveBeenCalledWith(
    expect.objectContaining(scope),
    "user",
  );
  expect(mocks.authorize.mock.invocationCallOrder[0]).toBeLessThan(
    mocks.work.mock.invocationCallOrder[0]!,
  );
  expect(mocks.authorize.mock.invocationCallOrder[1]).toBeLessThan(
    mocks.work.mock.invocationCallOrder[1]!,
  );
});
it("withholds detail tables until requested and forwards ledger periods", async () => {
  const data = {
    ...scope,
    target: { kind: "account" as const, id: "a" },
    period: "2026-02",
  };
  expect(await getAccountReturnDetails({ data })).toMatchObject({
    status: "complete",
    data: { valuations: [], cashFlows: [] },
  });
  expect(mocks.work).toHaveBeenCalledWith(
    expect.objectContaining({ ...data, includeDetails: false }),
    "user",
  );
  expect(
    await getAccountReturnDetails({ data: { ...data, includeDetails: true } }),
  ).toMatchObject({
    status: "complete",
    data: { valuations: [{ id: "valuation" }] },
  });
});
it("does not query unauthorized books", async () => {
  mocks.authorize.mockRejectedValue(new Error("Unauthorized"));
  await expect(getAccountReturnSummaries({ data: scope })).rejects.toThrow(
    "Unauthorized",
  );
  await expect(
    getAccountReturnDetails({
      data: { ...scope, target: { kind: "account", id: "other" } },
    }),
  ).rejects.toThrow("Unauthorized");
  expect(mocks.work).not.toHaveBeenCalled();
  expect(mocks.work).not.toHaveBeenCalled();
});
it("rejects invalid scopes, targets, and non-account period requests", () => {
  expect(() =>
    getAccountReturnSummaries({
      data: { ...scope, grouping: "other" as "assetClass" },
    }),
  ).toThrow("grouping is invalid");
  expect(() =>
    getAccountReturnDetails({
      data: { ...scope, target: { kind: "group", id: "" } },
    }),
  ).toThrow("id is required");
  expect(() =>
    getAccountReturnDetails({
      data: { ...scope, target: { kind: "total" }, period: "2026" },
    }),
  ).toThrow("individual accounts only");
});

it("accepts derived display-group IDs beyond persisted identifier length while bounding input", async () => {
  const id = archivedClassRowId(
    unitRowId(assetClassRowId("class".repeat(20)), "SECURITY:LONG-SYMBOL"),
  );
  expect(id.length).toBeGreaterThan(128);
  await getAccountReturnDetails({
    data: { ...scope, target: { kind: "group", id } },
  });
  expect(mocks.work).toHaveBeenCalledWith(
    expect.objectContaining({ target: { kind: "group", id } }),
    "user",
  );
  expect(() =>
    getAccountReturnDetails({
      data: { ...scope, target: { kind: "group", id: "x".repeat(2049) } },
    }),
  ).toThrow();
});

it("authorizes continuation requests and validates their workload bounds", async () => {
  mocks.work.mockResolvedValue({ status: "pending", continuation: "next" });
  expect(
    await getAccountReturnSummaries({
      data: { ...scope, continuation: "prior", batchSize: 4 },
    }),
  ).toEqual({ status: "pending", continuation: "next" });
  expect(mocks.work).toHaveBeenCalledWith(
    expect.objectContaining({ continuation: "prior", batchSize: 4 }),
    "user",
  );
  expect(mocks.authorize).toHaveBeenCalledWith("book");
  expect(() =>
    getAccountReturnSummaries({ data: { ...scope, batchSize: 129 } }),
  ).toThrow("batchSize");
  expect(() =>
    getAccountReturnSummaries({
      data: { ...scope, continuation: "x".repeat(256) },
    }),
  ).toThrow();
});
