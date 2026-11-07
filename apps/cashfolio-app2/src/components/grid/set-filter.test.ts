import { describe, expect, it } from "vitest";
import {
  buildHierarchySetFilterOptions,
  SET_FILTER_SPECIAL,
  setFilterEntityKey as key,
} from "./set-filter";

describe("hierarchical set filter options", () => {
  it("keeps duplicate names and special labels distinct by identity", () => {
    const options = buildHierarchySetFilterOptions(
      [
        { id: "a", name: "Equities", parentId: null, sortOrder: 0 },
        { id: "b", name: "Bonds", parentId: null, sortOrder: 1 },
        { id: "first", name: "Mixed", parentId: "a", sortOrder: 0 },
        { id: "second", name: "Mixed", parentId: "b", sortOrder: 0 },
        { id: "unused", name: "Unused", parentId: null, sortOrder: 2 },
      ],
      new Set(["a", "first", "second"]),
    );
    expect(options.values).toEqual([key("a"), key("first"), key("second")]);
    expect(options.paths.get(key("a"))).toEqual([
      key("a"),
      SET_FILTER_SPECIAL.direct,
    ]);
    expect(options.paths.get(key("first"))).toEqual([key("a"), key("first")]);
    expect(options.paths.get(key("second"))).toEqual([key("b"), key("second")]);
    expect(options.values).not.toContain(SET_FILTER_SPECIAL.mixed);
    expect(options.values).not.toContain(key("unused"));
  });

  it("orders siblings by configured order and retains ancestors of occupied values", () => {
    const options = buildHierarchySetFilterOptions(
      [
        { id: "second", name: "A", parentId: "root", sortOrder: 2 },
        { id: "root", name: "Root", parentId: null, sortOrder: 0 },
        { id: "first", name: "Z", parentId: "root", sortOrder: 1 },
      ],
      new Set(["first", "second"]),
    );
    expect(options.values).toEqual([key("first"), key("second")]);
    expect(options.paths.get(key("first"))).toEqual([
      key("root"),
      key("first"),
    ]);
    expect(options.labels.get(key("root"))).toBe("Root");
  });

  it("handles missing parents and prevents cycles from recursing forever", () => {
    const options = buildHierarchySetFilterOptions(
      [
        { id: "orphan", name: "Orphan", parentId: "missing", sortOrder: 0 },
        { id: "cycle", name: "Cycle", parentId: "cycle", sortOrder: 0 },
      ],
      new Set(["orphan", "cycle"]),
    );
    expect(options.values).toEqual([key("orphan")]);
    expect(options.paths.get(key("orphan"))).toEqual([key("orphan")]);
  });
});
