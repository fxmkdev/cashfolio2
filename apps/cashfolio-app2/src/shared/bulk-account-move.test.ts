import { describe, expect, it } from "vitest";
import { AccountType, Unit } from "../.prisma-client/enums";
import {
  cashFlowChangesMatch,
  getAccountMoveError,
  getMoveCashFlowChanges,
  getMovingAccounts,
  type MoveAccount,
  type MoveAccountGroup,
} from "./bulk-account-move";

const account: MoveAccount = {
  id: "first",
  name: "Checking",
  type: AccountType.BALANCE,
  unit: Unit.CURRENCY,
  groupId: "source",
  isActive: true,
  isCashAccount: false,
};
const group: MoveAccountGroup = {
  id: "target",
  name: "Target",
  type: AccountType.BALANCE,
  parentGroupId: null,
  isActive: true,
  isCashAccount: false,
};

describe("bulk account move rules", () => {
  it("permits mixed active/archived accounts in active balance groups and at root", () => {
    const accounts = [
      account,
      {
        ...account,
        id: "second",
        name: "Other",
        isActive: false,
        unit: Unit.SECURITY,
      },
    ];
    expect(getAccountMoveError(accounts, group, [])).toBeNull();
    expect(getAccountMoveError(accounts, null, [])).toBeNull();
  });
  it("permits archived destinations only for all-archived selections", () => {
    const archived = { ...group, isActive: false };
    expect(getAccountMoveError([account], archived)).toContain(
      "Active accounts",
    );
    expect(
      getAccountMoveError([{ ...account, isActive: false }], archived),
    ).toBeNull();
  });
  it("rejects category accounts and category groups", () => {
    expect(
      getAccountMoveError([{ ...account, type: AccountType.EQUITY }], group),
    ).toContain("Only balance accounts");
    expect(
      getAccountMoveError([account], { ...group, type: AccountType.EQUITY }),
    ).toContain("account group");
  });
  it.each([Unit.SECURITY, Unit.CRYPTOCURRENCY, null])(
    "rejects %s in groups included in cash flow",
    (unit) => {
      expect(
        getAccountMoveError([{ ...account, unit }], {
          ...group,
          isCashAccount: true,
        }),
      ).toContain("only currency accounts");
    },
  );
  it("detects case-insensitive conflicts with destination accounts and within the selection", () => {
    expect(
      getAccountMoveError([account], group, [
        { id: "other", name: "checking" },
      ]),
    ).toContain("Checking");
    expect(
      getAccountMoveError(
        [account, { ...account, id: "other", name: "CHECKING" }],
        group,
        [],
      ),
    ).toContain("same name");
    expect(
      getAccountMoveError([account], group, [
        { id: account.id, name: account.name },
      ]),
    ).toBeNull();
    expect(
      getAccountMoveError([{ ...account, name: "Cafe" }], group, [
        { id: "other", name: "Café" },
      ]),
    ).toBeNull();
  });
  it("previews only changes for accounts actually moving", () => {
    const alreadyThere = { ...account, id: "already", groupId: group.id };
    expect(getMovingAccounts([account, alreadyThere], group.id)).toEqual([
      account,
    ]);
    expect(
      getMoveCashFlowChanges([account, alreadyThere], {
        ...group,
        isCashAccount: true,
      }),
    ).toEqual({ includedAccountIds: [account.id], excludedAccountIds: [] });
    expect(
      getMoveCashFlowChanges([{ ...account, isCashAccount: true }], group),
    ).toEqual({ includedAccountIds: [], excludedAccountIds: [account.id] });
    expect(
      getMoveCashFlowChanges(
        [account, { ...account, id: "cash", isCashAccount: true }],
        null,
      ),
    ).toEqual({ includedAccountIds: [], excludedAccountIds: [] });
  });
  it("compares the reviewed change sets independent of order and rejects stale changes", () => {
    const actual = {
      includedAccountIds: ["a", "b"],
      excludedAccountIds: ["c"],
    };
    expect(
      cashFlowChangesMatch(actual, {
        includedAccountIds: ["b", "a"],
        excludedAccountIds: ["c"],
      }),
    ).toBe(true);
    expect(
      cashFlowChangesMatch(actual, {
        includedAccountIds: ["a"],
        excludedAccountIds: ["c"],
      }),
    ).toBe(false);
    expect(
      cashFlowChangesMatch(actual, {
        includedAccountIds: ["a", "b"],
        excludedAccountIds: [],
      }),
    ).toBe(false);
  });
});
