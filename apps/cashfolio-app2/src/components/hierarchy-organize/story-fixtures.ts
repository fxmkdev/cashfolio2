import { planAccountMove } from "@/shared/account-organize/move";
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
  initialNodes: OrganizeNode[] = organizeStoryNodes,
): OrganizerApi &
  Required<Pick<OrganizerApi, "archive" | "unarchive">> & {
    rename: (id: string, name: string) => void;
    create: (node: OrganizeNode) => void;
  } {
  let nodes = structuredClone(initialNodes);
  let failed = false;
  const snapshot = (): OrganizeSnapshot => ({
    nodes: structuredClone(nodes),
    version: JSON.stringify(nodes),
    actionAvailability: Object.fromEntries(
      nodes.map((node) => {
        const children = nodes.filter((item) => item.parentId === node.id);
        const blockedArchive = children.some((item) => item.isActive);
        const archivedParent = nodes.find(
          (item) => item.id === node.parentId && item.isActive === false,
        );
        return [
          node.id,
          {
            archivable: node.isActive && !blockedArchive,
            archiveDisabledReason: blockedArchive
              ? "Cannot archive group because it contains active accounts"
              : node.isActive === false
                ? "Already archived"
                : undefined,
            unarchivable: node.isActive === false && !archivedParent,
            unarchiveDisabledReason: archivedParent
              ? "Cannot unarchive because its parent group is archived"
              : node.isActive
                ? "Already active"
                : undefined,
            deletable: !children.length && node.id !== "fund",
            deleteDisabledReason: children.length
              ? "Cannot delete group because it contains accounts"
              : node.id === "fund"
                ? "Cannot delete account because it has bookings"
                : undefined,
          },
        ];
      }),
    ),
  });
  function mutate(action: "archive" | "unarchive" | "delete", id: string) {
    const availability = snapshot().actionAvailability[id];
    if (
      !availability ||
      !(action === "archive"
        ? availability.archivable
        : action === "unarchive"
          ? availability.unarchivable
          : availability.deletable)
    )
      throw new Error("Action unavailable");
    if (failure && !failed) {
      failed = true;
      throw failure === "network"
        ? new TypeError("Failed to fetch")
        : new Error(ACCOUNT_BOOK_BUSY_MESSAGE);
    }
    nodes =
      action === "delete"
        ? nodes.filter((node) => node.id !== id)
        : nodes.map((node) =>
            node.id === id
              ? { ...node, isActive: action === "unarchive" }
              : node,
          );
  }
  function mutateMany(
    action: "archive" | "delete",
    targets: Parameters<NonNullable<OrganizerApi["archiveMany"]>>[0],
  ) {
    const before = structuredClone(nodes);
    const availability = snapshot().actionAvailability;
    try {
      for (const target of targets) {
        const allowed = availability[target.id];
        if (!(action === "archive" ? allowed?.archivable : allowed?.deletable))
          throw new Error("Action unavailable");
      }
      for (const target of targets) mutate(action, target.id);
    } catch (error) {
      nodes = before;
      throw error;
    }
  }
  return {
    create: (node) => {
      nodes = [...nodes, node];
    },
    rename: (id, name) => {
      nodes = nodes.map((node) => (node.id === id ? { ...node, name } : node));
    },
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
      nodes = planAccountMove(nodes, {
        ...move,
        items: move.items.map((item) => {
          if (item.nodeType === "assetClass")
            throw new Error("Choose an account or group.");
          return { ...item, nodeType: item.nodeType };
        }),
      });
      return {
        snapshot: snapshot(),
        changed: nodes !== before,
      };
    },
    archive: async (target) => {
      mutate("archive", target.id);
    },
    unarchive: async (target) => {
      mutate("unarchive", target.id);
    },
    delete: async (target) => {
      mutate("delete", target.id);
    },
    archiveMany: async (targets) => mutateMany("archive", targets),
    deleteMany: async (targets) => mutateMany("delete", targets),
  };
}
