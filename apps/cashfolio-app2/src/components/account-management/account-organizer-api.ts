import {
  getAccountOrganizeData,
  archiveAccountTreeItems,
  deleteAccountTreeItems,
  moveAccountTreeItems,
  archiveAccount,
  archiveAccountGroup,
  unarchiveAccount,
  unarchiveAccountGroup,
  deleteAccount,
  deleteAccountGroup,
} from "@/server/accounts";
import type { OrganizerApi } from "@/components/hierarchy-organize/use-organizer";
import type { AccountsPageControllerOptions } from "./page-controller-types";
type OrganizerOptions = Pick<
  AccountsPageControllerOptions,
  "accountBookId" | "managementContext" | "tab"
>;

export function getAccountOrganizeScope(args: OrganizerOptions) {
  return args.managementContext === "categories"
    ? args.tab === "EQUITY-INCOME"
      ? "income"
      : "expense"
    : "balance";
}

function accountMoveItems(items: Parameters<OrganizerApi["move"]>[0]["items"]) {
  return items.map((item) => {
    if (item.nodeType === "assetClass")
      throw new Error("Choose a category or account.");
    return { ...item, nodeType: item.nodeType };
  });
}

export function createAccountOrganizerApi(
  args: OrganizerOptions,
): OrganizerApi {
  const accountBookId = args.accountBookId;
  const scope = getAccountOrganizeScope(args);
  return {
    kind: args.managementContext === "categories" ? "categories" : "accounts",
    load: () => getAccountOrganizeData({ data: { accountBookId, scope } }),
    move: (move, version) =>
      moveAccountTreeItems({
        data: {
          accountBookId,
          ...move,
          items: accountMoveItems(move.items),
          version,
          scope,
        },
      }),
    ...(args.managementContext !== "categories"
      ? ({
          archiveMany: (items) =>
            archiveAccountTreeItems({
              data: { accountBookId, items: accountMoveItems(items) },
            }),
          deleteMany: (items) =>
            deleteAccountTreeItems({
              data: { accountBookId, items: accountMoveItems(items) },
            }),
        } satisfies Partial<OrganizerApi>)
      : {}),
    archive: (target) =>
      (target.nodeType === "account" ? archiveAccount : archiveAccountGroup)({
        data: { id: target.id, accountBookId },
      }),
    unarchive: (target) =>
      (target.nodeType === "account"
        ? unarchiveAccount
        : unarchiveAccountGroup)({ data: { id: target.id, accountBookId } }),
    delete: (target) =>
      (target.nodeType === "account" ? deleteAccount : deleteAccountGroup)({
        data: { id: target.id, accountBookId },
      }),
  };
}
