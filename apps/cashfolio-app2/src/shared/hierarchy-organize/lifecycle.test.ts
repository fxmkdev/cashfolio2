import { describe, expect, it } from "vitest";
import { planBulkLifecycle } from "./lifecycle";
import type { OrganizeNode, OrganizeSnapshot } from "../accounts/organize/types";
import type { OrganizeNodeRef } from "./types";

const node = (
  id: string,
  parentId: string | null,
  nodeType: "account" | "accountGroup",
  isActive = true,
): OrganizeNode => ({
  id,
  name: id,
  parentId,
  nodeType,
  isActive,
  sortOrder: 0,
  isCashAccount: false,
  unit: nodeType === "account" ? "CURRENCY" : null,
});
function fixture(archived = false): OrganizeSnapshot {
  const nodes = [
    node("Root", null, "accountGroup"),
    node("Branch", "Root", "accountGroup"),
    node("Leaf", "Branch", "account"),
    node("Hidden", "Root", "account", false),
  ];
  if (archived) for (const item of nodes) item.isActive = false;
  return {
    version: "version",
    nodes,
    actionAvailability: Object.fromEntries(
      nodes.map((item) => [
        item.id,
        {
          archivable: item.nodeType === "account" && item.isActive,
          archiveDisabledReason: item.isActive
            ? "Has active children"
            : "Already archived",
          deletable: item.nodeType === "account",
          deleteDisabledReason: "Has children",
          unarchivable: !item.isActive && item.parentId === null,
          unarchiveDisabledReason: "Archived ancestor",
        },
      ]),
    ),
  };
}
function refs(snapshot: OrganizeSnapshot, ids: string[]): OrganizeNodeRef[] {
  return ids.map((id) => {
    const item = snapshot.nodes.find((item) => item.id === id)!;
    return { id, nodeType: item.nodeType };
  });
}

describe("collective lifecycle planning", () => {
  it.each(["archive", "unarchive", "delete"] as const)(
    "plans %s in dependency order without changing the selection or snapshot",
    (action) => {
      const snapshot = fixture(action === "unarchive");
      const before = structuredClone(snapshot);
      const ids =
        action === "delete"
          ? ["Root", "Branch", "Leaf", "Hidden"]
          : ["Root", "Branch", "Leaf"];
      const targets = refs(snapshot, ids);
      const ordered = planBulkLifecycle(snapshot, targets, action);
      const positions = new Map(ordered.map((item, index) => [item.id, index]));
      for (const [parent, child] of [
        ["Root", "Branch"],
        ["Branch", "Leaf"],
      ]) {
        if (action === "unarchive")
          expect(positions.get(parent)!).toBeLessThan(positions.get(child)!);
        else expect(positions.get(child)!).toBeLessThan(positions.get(parent)!);
      }
      expect(ordered.map((item) => item.id).sort()).toEqual([...ids].sort());
      expect(planBulkLifecycle(snapshot, targets.toReversed(), action)).toEqual(
        ordered,
      );
      expect(
        planBulkLifecycle(
          { ...snapshot, nodes: snapshot.nodes.toReversed() },
          targets,
          action,
        ),
      ).toEqual(ordered);
      expect(snapshot).toEqual(before);
    },
  );

  it.each([{ ids: ["Root", "Leaf"] }, { ids: ["Branch", "Leaf"] }])(
    "blocks Unarchive when an archived ancestor is absent: $ids",
    ({ ids }) => {
      const snapshot = fixture(true);
      expect(() =>
        planBulkLifecycle(snapshot, refs(snapshot, ids), "unarchive"),
      ).toThrow(ids.includes("Root") ? "Branch" : "Root");
    },
  );

  it("requires every active descendant needed to archive a selected group", () => {
    const snapshot = fixture();
    expect(() =>
      planBulkLifecycle(
        snapshot,
        refs(snapshot, ["Root", "Branch"]),
        "archive",
      ),
    ).toThrow("Leaf");
    expect(() =>
      planBulkLifecycle(snapshot, refs(snapshot, ["Root", "Leaf"]), "archive"),
    ).toThrow("Branch");
  });

  it("permits archived unselected children for Archive but requires them for Delete", () => {
    const snapshot = fixture();
    const targets = refs(snapshot, ["Root", "Branch", "Leaf"]);
    expect(planBulkLifecycle(snapshot, targets, "archive")).toHaveLength(3);
    expect(() => planBulkLifecycle(snapshot, targets, "delete")).toThrow(
      "Hidden",
    );
    snapshot.nodes.find((item) => item.id === "Leaf")!.isActive = false;
    expect(() =>
      planBulkLifecycle(
        snapshot,
        refs(snapshot, ["Root", "Branch", "Hidden"]),
        "delete",
      ),
    ).toThrow("Leaf");
  });

  it.each(["archive", "delete"] as const)(
    "keeps nonstructural account restrictions for %s",
    (action) => {
      const snapshot = fixture();
      snapshot.actionAvailability.Leaf.archivable = false;
      snapshot.actionAvailability.Leaf.archiveDisabledReason =
        "Nonzero balance";
      snapshot.actionAvailability.Leaf.deletable = false;
      snapshot.actionAvailability.Leaf.deleteDisabledReason = "Has bookings";
      expect(() =>
        planBulkLifecycle(
          snapshot,
          refs(snapshot, [
            "Root",
            "Branch",
            "Leaf",
            ...(action === "delete" ? ["Hidden"] : []),
          ]),
          action,
        ),
      ).toThrow(action === "archive" ? "Nonzero balance" : "Has bookings");
    },
  );

  it("retains status restrictions for Archive and Unarchive", () => {
    const snapshot = fixture();
    expect(() =>
      planBulkLifecycle(
        snapshot,
        refs(snapshot, ["Leaf", "Hidden"]),
        "archive",
      ),
    ).toThrow("Already archived");
    expect(() =>
      planBulkLifecycle(snapshot, refs(snapshot, ["Leaf"]), "unarchive"),
    ).toThrow("already active");
  });

  it.each([
    { targets: [] },
    {
      targets: [
        { id: "Leaf", nodeType: "account" },
        { id: "Leaf", nodeType: "account" },
      ],
    },
    { targets: [{ id: "missing", nodeType: "account" }] },
    { targets: [{ id: "Leaf", nodeType: "accountGroup" }] },
    { targets: [{ id: "Root", nodeType: "assetClass" }] },
  ] as { targets: OrganizeNodeRef[] }[])(
    "rejects malformed selections: $targets",
    ({ targets }) => {
      expect(() => planBulkLifecycle(fixture(), targets, "delete")).toThrow();
    },
  );

  it.each(["cycle", "missing", "account"])(
    "rejects an invalid parent graph: %s",
    (parent) => {
      const snapshot = fixture();
      snapshot.nodes[0].parentId =
        parent === "cycle"
          ? "Branch"
          : parent === "account"
            ? "Leaf"
            : "missing";
      expect(() =>
        planBulkLifecycle(snapshot, refs(snapshot, ["Leaf"]), "delete"),
      ).toThrow(/hierarchy/);
    },
  );

  it("requires fresh metadata for all selected rows", () => {
    const snapshot = fixture();
    delete snapshot.actionAvailability.Leaf;
    expect(() =>
      planBulkLifecycle(snapshot, refs(snapshot, ["Leaf"]), "delete"),
    ).toThrow("no longer available");
    expect(() =>
      planBulkLifecycle(
        undefined,
        [{ id: "Leaf", nodeType: "account" }],
        "delete",
      ),
    ).toThrow("no longer available");
  });
});
