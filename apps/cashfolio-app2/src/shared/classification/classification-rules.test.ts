import { describe, expect, it } from "vitest";
import {
  classificationOptions,
  getAssetClassLabel,
  type ClassificationNode,
} from "./asset-class";
import { validateClassificationChange } from "./classification-rules";
const nodes: ClassificationNode[] = [
  { id: "equities", name: "Equities", parentId: null, sortOrder: 1 },
  { id: "swiss", name: "Swiss Equities", parentId: "equities", sortOrder: 0 },
  { id: "cash", name: "Cash", parentId: null, sortOrder: 0 },
];
describe("classification trees", () => {
  it("orders siblings and provides searchable paths", () => {
    expect(classificationOptions(nodes).map((n) => n.label)).toEqual([
      "Cash",
      "Equities",
      "Equities / Swiss Equities",
    ]);
    expect(getAssetClassLabel("swiss", nodes)).toBe(
      "Equities / Swiss Equities",
    );
    expect(getAssetClassLabel(null, nodes)).toBe("Unclassified");
  });
  it.each(["equities", "swiss"])("rejects a cycle under %s", (parentId) =>
    expect(() =>
      validateClassificationChange(nodes, {
        id: "equities",
        name: "Equities",
        parentId,
      }),
    ).toThrow("descendants"),
  );
  it("rejects stale nodes and parents", () => {
    expect(() =>
      validateClassificationChange(nodes, {
        id: "deleted",
        name: "New",
        parentId: null,
      }),
    ).toThrow("no longer available");
    expect(() =>
      validateClassificationChange(nodes, { name: "New", parentId: "deleted" }),
    ).toThrow("no longer available");
  });
  it("rejects empty names and case-insensitive duplicates among siblings", () => {
    expect(() =>
      validateClassificationChange(nodes, { name: "  ", parentId: null }),
    ).toThrow("Name is required");
    expect(() =>
      validateClassificationChange(nodes, {
        name: "  equities ",
        parentId: null,
      }),
    ).toThrow("already exists");
    expect(() =>
      validateClassificationChange(nodes, {
        name: "Equities",
        parentId: "cash",
      }),
    ).not.toThrow();
    expect(() =>
      validateClassificationChange(nodes, {
        id: "equities",
        name: "Equities",
        parentId: null,
      }),
    ).not.toThrow();
  });
});
