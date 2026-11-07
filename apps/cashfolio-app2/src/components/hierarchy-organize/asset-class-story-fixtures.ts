import { createId } from "@paralleldrive/cuid2";
import { validateClassificationChange } from "@/shared/classification-rules";
import { planAssetClassMove } from "@/shared/hierarchy-organize/move";
import type {
  AssetClassOrganizeNode,
  OrganizeSnapshot,
} from "@/shared/hierarchy-organize/types";
import type { OrganizerApi } from "./use-organizer";

export const assetClassStoryNodes: AssetClassOrganizeNode[] = [
  {
    id: "equities",
    name: "Equities",
    parentId: null,
    sortOrder: 0,
    nodeType: "assetClass",
    activeCount: 1,
    archivedCount: 0,
  },
  {
    id: "swiss",
    name: "Swiss Equities",
    parentId: "equities",
    sortOrder: 0,
    nodeType: "assetClass",
    activeCount: 2,
    archivedCount: 1,
  },
  {
    id: "cash",
    name: "Cash",
    parentId: null,
    sortOrder: 1,
    nodeType: "assetClass",
    activeCount: 0,
    archivedCount: 0,
  },
];

export function createAssetClassStoryApi(
  initialNodes = assetClassStoryNodes,
): OrganizerApi & {
  save: (draft: {
    id?: string;
    name: string;
    parentId: string | null;
  }) => Promise<void>;
} {
  let nodes = structuredClone(initialNodes);
  let version = 0;
  const snapshot = (): OrganizeSnapshot =>
    structuredClone({
      nodes,
      version: String(version),
      actionAvailability: Object.fromEntries(
        nodes.map((node) => {
          const hasChildren = nodes.some((child) => child.parentId === node.id);
          return [
            node.id,
            {
              archivable: false,
              unarchivable: false,
              deletable: !hasChildren,
              ...(hasChildren
                ? { deleteDisabledReason: "Move or delete child classes first" }
                : {}),
            },
          ];
        }),
      ),
    });
  return {
    kind: "assetClasses",
    save: async (draft) => {
      validateClassificationChange(nodes, draft);
      const current = nodes.find((node) => node.id === draft.id);
      const sortOrder =
        current?.parentId === draft.parentId
          ? current.sortOrder
          : Math.max(
              -1,
              ...nodes
                .filter((node) => node.parentId === draft.parentId)
                .map((node) => node.sortOrder),
            ) + 1;
      if (current) Object.assign(current, draft, { sortOrder });
      else
        nodes.push({
          ...draft,
          id: createId(),
          sortOrder,
          nodeType: "assetClass",
          activeCount: 0,
          archivedCount: 0,
        });
      version++;
    },
    load: async () => snapshot(),
    move: async (move, expected) => {
      if (expected !== String(version))
        throw new Error("The asset class hierarchy changed.");
      const next = planAssetClassMove(nodes, move);
      const changed = next !== nodes;
      nodes = next;
      if (changed) version++;
      return { snapshot: snapshot(), changed };
    },
    delete: async (target, replacementId) => {
      const node = nodes.find((node) => node.id === target.id);
      if (!node || nodes.some((child) => child.parentId === target.id))
        throw new Error("Move or delete child classes first");
      if (replacementId === undefined || replacementId === target.id)
        throw new Error("Choose a replacement class or Unclassified.");
      if (
        replacementId !== null &&
        !nodes.some((node) => node.id === replacementId)
      )
        throw new Error("Choose an available replacement.");
      nodes = nodes
        .filter((item) => item.id !== target.id)
        .map((item) =>
          item.id === replacementId
            ? {
                ...item,
                activeCount: item.activeCount + node.activeCount,
                archivedCount: item.archivedCount + node.archivedCount,
              }
            : item,
        );
      version++;
    },
  };
}
