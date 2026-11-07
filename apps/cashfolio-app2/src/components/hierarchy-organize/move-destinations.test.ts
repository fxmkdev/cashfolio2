import { describe, expect, it } from "vitest";
import {
  buildGroupTreeData,
  getGroupTreeSearchLabel,
} from "@/components/account-tree/group-tree-select";
import {
  moveDestinationGroups,
  TOP_LEVEL_DESTINATION,
} from "./move-destinations";
import { organizeStoryNodes } from "./story-fixtures";

describe("organizer destination tree", () => {
  const checking = organizeStoryNodes.find((node) => node.id === "checking")!;
  it("includes explicit Top Level and nests real groups in saved sibling order", () => {
    const groups = moveDestinationGroups(organizeStoryNodes, [checking], true);
    const tree = buildGroupTreeData(groups);
    expect(tree.map((node) => node.value)).toEqual([
      TOP_LEVEL_DESTINATION,
      "investments",
      "destination",
      "empty",
      "cash",
    ]);
    expect(
      tree
        .find((node) => node.value === "investments")
        ?.children?.map((node) => node.value),
    ).toEqual(["nested"]);
  });
  it("excludes selected groups and descendants, including cash-incompatible destinations", () => {
    const investment = organizeStoryNodes.find(
      (node) => node.id === "investments",
    )!;
    const groups = moveDestinationGroups(
      organizeStoryNodes,
      [investment],
      true,
    );
    expect(groups.map((group) => group.value)).toEqual([
      TOP_LEVEL_DESTINATION,
      "destination",
      "empty",
    ]);
  });
  it("preserves literal slashes in names and searches across the complete real path", () => {
    const nodes = organizeStoryNodes.map((node) =>
      node.id === "investments" ? { ...node, name: "Cash / Cards" } : node,
    );
    const tree = buildGroupTreeData(
      moveDestinationGroups(nodes, [checking], true),
    );
    const root = tree.find((node) => node.value === "investments")!;
    expect(root.label).toBe("Cash / Cards");
    expect(root.children?.[0]?.label).toBe("Brokerage");
    expect(getGroupTreeSearchLabel(root.children![0]!)).toBe(
      "Cash / Cards / Brokerage",
    );
  });
  it("respects archived visibility and final archive-parent eligibility", () => {
    const closed = {
      ...organizeStoryNodes.find((node) => node.id === "empty")!,
      isActive: false,
    };
    const nodes = [
      ...organizeStoryNodes.filter((node) => node.id !== "empty"),
      closed,
    ];
    const archived = nodes.find((node) => node.id === "archived")!;
    expect(
      moveDestinationGroups(nodes, [archived], true).find(
        (node) => node.value === "empty",
      )?.treeLabel,
    ).toBe("Empty Group (Archived)");
    expect(
      moveDestinationGroups(nodes, [archived], false).some(
        (node) => node.value === "empty",
      ),
    ).toBe(false);
    expect(
      moveDestinationGroups(nodes, [checking], true).some(
        (node) => node.value === "empty",
      ),
    ).toBe(false);
  });
});
