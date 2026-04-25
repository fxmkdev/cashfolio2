import { describe, expect, test } from "vitest";
import { AccountType } from "../.prisma-client/enums";
import {
  accountTypeRequiresZeroBalanceForArchive,
  getAccountArchiveAvailability,
  getAccountDeleteAvailability,
  getAccountUnarchiveAvailability,
  getGroupArchiveAvailability,
  getGroupDeleteAvailability,
  getGroupUnarchiveAvailability,
} from "./account-tree-rules";

describe("accountTypeRequiresZeroBalanceForArchive", () => {
  test("returns true for asset and liability accounts", () => {
    expect(accountTypeRequiresZeroBalanceForArchive(AccountType.ASSET)).toBe(
      true,
    );
    expect(
      accountTypeRequiresZeroBalanceForArchive(AccountType.LIABILITY),
    ).toBe(true);
  });

  test("returns false for equity accounts", () => {
    expect(accountTypeRequiresZeroBalanceForArchive(AccountType.EQUITY)).toBe(
      false,
    );
  });
});

describe("account action availability", () => {
  test("marks accounts with bookings as non-deletable", () => {
    expect(getAccountDeleteAvailability(true)).toEqual({
      enabled: false,
      disabledReason: "Cannot delete account because it has bookings",
    });
  });

  test("marks archived accounts as non-archivable", () => {
    expect(
      getAccountArchiveAvailability({ isActive: false, hasZeroBalance: true }),
    ).toEqual({
      enabled: false,
      disabledReason: "Account is already archived",
    });
  });

  test("marks non-zero balance accounts as non-archivable", () => {
    expect(
      getAccountArchiveAvailability({ isActive: true, hasZeroBalance: false }),
    ).toEqual({
      enabled: false,
      disabledReason: "Cannot archive account because its balance is not 0",
    });
  });

  test("marks accounts with archived ancestors as non-unarchivable", () => {
    expect(
      getAccountUnarchiveAvailability({
        isActive: false,
        hasInactiveAncestor: true,
      }),
    ).toEqual({
      enabled: false,
      disabledReason:
        "Cannot unarchive account because its parent group is archived",
    });
  });
});

describe("group action availability", () => {
  test("prioritizes group delete reasons in the expected order", () => {
    expect(
      getGroupDeleteAvailability({
        hasChildAccounts: true,
        hasChildGroups: true,
      }),
    ).toEqual({
      enabled: false,
      disabledReason: "Cannot delete group because it contains accounts",
    });

    expect(
      getGroupDeleteAvailability({
        hasChildAccounts: false,
        hasChildGroups: true,
      }),
    ).toEqual({
      enabled: false,
      disabledReason: "Cannot delete group because it contains sub-groups",
    });
  });

  test("marks active groups with active descendants as non-archivable", () => {
    expect(
      getGroupArchiveAvailability({
        isActive: true,
        hasActiveChildAccounts: false,
        hasActiveChildGroups: true,
      }),
    ).toEqual({
      enabled: false,
      disabledReason:
        "Cannot archive group because it contains active sub-groups",
    });
  });

  test("marks groups with inactive ancestors as non-unarchivable", () => {
    expect(
      getGroupUnarchiveAvailability({
        isActive: false,
        hasInactiveAncestor: true,
      }),
    ).toEqual({
      enabled: false,
      disabledReason:
        "Cannot unarchive group because its parent group is archived",
    });
  });
});
