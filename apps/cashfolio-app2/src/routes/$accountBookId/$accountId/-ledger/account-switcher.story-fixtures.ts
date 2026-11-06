import { AccountType } from "@/.prisma-client/enums";
import {
  buildLedgerAccountSwitcherData,
  type NavigationGroup,
} from "./account-switcher-data";

export const switcherStoryAccount = {
  id: "checking",
  name: "Checking",
  groupPathSegments: ["Banking", "Main Bank"],
};

export function createSwitcherStoryTree(
  current: typeof switcherStoryAccount = switcherStoryAccount,
) {
  const groups: NavigationGroup[] = current.groupPathSegments.map(
    (name, index) => ({
      id: `current-group-${index}`,
      name,
      parentGroupId: index ? `current-group-${index - 1}` : null,
      isActive: true,
      sortOrder: index,
    }),
  );
  groups.push(
    {
      id: "other-bank",
      name: "Other Bank",
      parentGroupId: null,
      isActive: true,
      sortOrder: 1,
    },
    {
      id: "empty",
      name: "Empty Group",
      parentGroupId: null,
      isActive: true,
      sortOrder: 2,
    },
  );
  const account = (
    id: string,
    name: string,
    groupId: string | null,
    isActive = true,
    sortOrder = 0,
  ) => ({
    id,
    name,
    groupId,
    isActive,
    sortOrder,
    type: AccountType.BALANCE,
  });
  const currentGroupId = current.groupPathSegments.length
    ? `current-group-${current.groupPathSegments.length - 1}`
    : null;
  return buildLedgerAccountSwitcherData({
    groups,
    accounts: [
      account(current.id, current.name, currentGroupId),
      account("savings", "Savings", currentGroupId, true, 1),
      account("travel", "Travel EUR", "other-bank"),
      account("other-checking", "Checking", "other-bank", true, 1),
      account("retired", "Retired Account", currentGroupId, false),
    ],
  });
}
