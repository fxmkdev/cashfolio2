import { beforeEach, expect, it, vi } from "vitest";
import {
  getAccountOrganizeData,
  moveAccountTreeItems,
  archiveAccount,
  archiveAccountGroup,
  unarchiveAccount,
  unarchiveAccountGroup,
  deleteAccount,
  deleteAccountGroup,
} from "@/server/accounts";
import { createAccountOrganizerApi } from "./account-organizer-api";

vi.mock("@/server/accounts", () => ({
  getAccountOrganizeData: vi.fn(),
  moveAccountTreeItems: vi.fn(),
  archiveAccount: vi.fn(),
  archiveAccountGroup: vi.fn(),
  unarchiveAccount: vi.fn(),
  unarchiveAccountGroup: vi.fn(),
  deleteAccount: vi.fn(),
  deleteAccountGroup: vi.fn(),
}));
beforeEach(() => vi.clearAllMocks());

it.each([
  ["accounts", "BALANCE", "balance"],
  ["categories", "EQUITY-INCOME", "income"],
  ["categories", "EQUITY-EXPENSE", "expense"],
] as const)(
  "keeps %s/%s load and move scopes aligned",
  async (managementContext, tab, scope) => {
    const api = createAccountOrganizerApi({
      accountBookId: "book",
      managementContext,
      tab,
    });
    await api.load();
    expect(getAccountOrganizeData).toHaveBeenCalledWith({
      data: { accountBookId: "book", scope },
    });
    const move = {
      items: [{ id: "group", nodeType: "accountGroup" as const }],
      parentId: null,
      placement: "before" as const,
      anchorId: "sibling",
    };
    await api.move(move, "version");
    expect(moveAccountTreeItems).toHaveBeenCalledWith({
      data: { accountBookId: "book", ...move, version: "version", scope },
    });
    expect(api.kind).toBe(managementContext);
  },
);

it("rejects asset-class move targets before a server call", () => {
  const api = createAccountOrganizerApi({
    accountBookId: "book",
    tab: "BALANCE",
  });
  expect(() =>
    api.move(
      {
        items: [{ id: "class", nodeType: "assetClass" }],
        parentId: null,
        placement: "last",
      },
      "version",
    ),
  ).toThrow("Choose a category or account.");
  expect(moveAccountTreeItems).not.toHaveBeenCalled();
});

it.each(["account", "accountGroup"] as const)(
  "routes lifecycle actions to the %s endpoints",
  async (nodeType) => {
    const api = createAccountOrganizerApi({
      accountBookId: "book",
      tab: "BALANCE",
    });
    const target = { id: "target", nodeType };
    await api.archive!(target);
    await api.unarchive!(target);
    await api.delete(target);
    const endpoints =
      nodeType === "account"
        ? [archiveAccount, unarchiveAccount, deleteAccount]
        : [archiveAccountGroup, unarchiveAccountGroup, deleteAccountGroup];
    for (const endpoint of endpoints)
      expect(endpoint).toHaveBeenCalledWith({
        data: { id: "target", accountBookId: "book" },
      });
  },
);
