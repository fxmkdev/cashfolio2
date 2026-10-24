import { describe, expect, it } from "vitest";
import {
  keepArchivedGroupsLast,
  isVirtualArchivedGroup,
} from "./-archived-grid-rows";

describe("archived grid ordering", () => {
  it.each([false, true])(
    "keeps Archived last while preserving the grid's real-row sort order (descending=%s)",
    (descending) => {
      const real = [{ data: { id: "a" } }, { data: { id: "z" } }];
      if (descending) real.reverse();
      const archived = {
        data: { id: "virtual", isVirtualArchivedGroup: true },
      };
      const nodes = [archived, ...real];
      keepArchivedGroupsLast(nodes);
      expect(nodes).toEqual([...real, archived]);
    },
  );
  it("recognizes only explicit virtual rows", () => {
    for (const value of [
      undefined,
      null,
      {},
      { name: "Archived" },
      { isVirtualArchivedGroup: false },
    ])
      expect(isVirtualArchivedGroup(value)).toBe(false);
  });
});
