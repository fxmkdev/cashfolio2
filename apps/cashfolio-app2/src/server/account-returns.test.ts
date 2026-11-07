import { beforeEach, expect, it, vi } from "vitest";
import { emptyAccountReturnResult } from "../shared/account-returns";
import {
  unitRowId,
  assetClassRowId,
  archivedClassRowId,
} from "../shared/account-return-groups";
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
vi.mock("./accounts/returns/account-returns.server", () => ({
  queryAccountReturnSummaries: mocks.summaries,
  queryAccountReturnDetails: mocks.details,
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
  mocks.authorize.mockResolvedValue(undefined);
  mocks.details.mockResolvedValue({
    ...emptyAccountReturnResult(),
    valuations: [{ id: "valuation" }],
    cashFlows: [{ id: "flow" }],
  });
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
  expect(mocks.summaries).toHaveBeenCalledWith(scope);
  expect(mocks.authorize.mock.invocationCallOrder[0]).toBeLessThan(
    mocks.summaries.mock.invocationCallOrder[0]!,
  );
  expect(mocks.authorize.mock.invocationCallOrder[1]).toBeLessThan(
    mocks.details.mock.invocationCallOrder[0]!,
  );
});
it("withholds detail tables until requested and forwards ledger periods", async () => {
  const data = {
    ...scope,
    target: { kind: "account" as const, id: "a" },
    period: "2026-02",
  };
  expect(await getAccountReturnDetails({ data })).toMatchObject({
    valuations: [],
    cashFlows: [],
  });
  expect(mocks.details).toHaveBeenCalledWith({
    ...data,
    includeDetails: false,
  });
  expect(
    await getAccountReturnDetails({ data: { ...data, includeDetails: true } }),
  ).toMatchObject({ valuations: [{ id: "valuation" }] });
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
  expect(mocks.details).not.toHaveBeenCalled();
  expect(mocks.summaries).not.toHaveBeenCalled();
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
  expect(mocks.details).toHaveBeenCalledWith(
    expect.objectContaining({ target: { kind: "group", id } }),
  );
  expect(() =>
    getAccountReturnDetails({
      data: { ...scope, target: { kind: "group", id: "x".repeat(2049) } },
    }),
  ).toThrow();
});
