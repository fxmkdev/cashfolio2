import {
  organizeChanges,
  planAccountMove,
  restoreAccountMove,
} from "@/shared/account-organize/move";
import type {
  OrganizeNode,
  OrganizeSnapshot,
} from "@/shared/account-organize/types";
import { ACCOUNT_BOOK_BUSY_MESSAGE } from "@/shared/mutation-errors";
import type { OrganizerApi } from "./use-organizer";

export const organizeStoryNodes: OrganizeNode[] = [
  {
    id: "investments",
    nodeType: "accountGroup",
    name: "Investments",
    parentId: null,
    sortOrder: 0,
    isActive: true,
    isCashAccount: false,
    unit: null,
  },
  {
    id: "nested",
    nodeType: "accountGroup",
    name: "Brokerage",
    parentId: "investments",
    sortOrder: 0,
    isActive: true,
    isCashAccount: false,
    unit: null,
  },
  {
    id: "holding",
    nodeType: "account",
    name: "Fund",
    parentId: "nested",
    sortOrder: null,
    isActive: true,
    isCashAccount: false,
    unit: "SECURITY",
  },
  {
    id: "archived",
    nodeType: "account",
    name: "Old Fund",
    parentId: "investments",
    sortOrder: null,
    isActive: false,
    isCashAccount: false,
    unit: "SECURITY",
  },
  {
    id: "destination",
    nodeType: "accountGroup",
    name: "Long-Term",
    parentId: null,
    sortOrder: 1,
    isActive: true,
    isCashAccount: false,
    unit: null,
  },
  {
    id: "empty",
    nodeType: "accountGroup",
    name: "Empty Group",
    parentId: null,
    sortOrder: 2,
    isActive: true,
    isCashAccount: false,
    unit: null,
  },
  {
    id: "checking",
    nodeType: "account",
    name: "Checking",
    parentId: null,
    sortOrder: 3,
    isActive: true,
    isCashAccount: false,
    unit: "CURRENCY",
  },
  {
    id: "cash",
    nodeType: "accountGroup",
    name: "Cash",
    parentId: null,
    sortOrder: 4,
    isActive: true,
    isCashAccount: true,
    unit: null,
  },
];

export function createOrganizerStoryApi(
  failure?: "busy" | "network" | "load",
): OrganizerApi {
  let nodes = structuredClone(organizeStoryNodes);
  let failed = false;
  const snapshot = (): OrganizeSnapshot => ({
    nodes: structuredClone(nodes),
    version: JSON.stringify(nodes),
  });
  return {
    load: async () => {
      if (failure === "load" && !failed) {
        failed = true;
        throw new Error("Unavailable");
      }
      return snapshot();
    },
    move: async (move, version) => {
      if (version !== snapshot().version)
        throw new Error("The hierarchy changed.");
      if (failure && !failed) {
        failed = true;
        throw failure === "network"
          ? new TypeError("Failed to fetch")
          : new Error(ACCOUNT_BOOK_BUSY_MESSAGE);
      }
      const before = nodes;
      nodes = planAccountMove(nodes, move);
      return {
        snapshot: snapshot(),
        undo:
          nodes === before
            ? null
            : {
                version: snapshot().version,
                restore: organizeChanges(nodes, before),
              },
      };
    },
    undo: async (undo) => {
      if (undo.version !== snapshot().version)
        throw new Error("The hierarchy changed.");
      nodes = restoreAccountMove(nodes, undo.restore);
      return snapshot();
    },
  };
}
