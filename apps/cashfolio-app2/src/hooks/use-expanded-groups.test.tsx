import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import { useExpandedGroups } from "./use-expanded-groups";

afterEach(() => vi.unstubAllGlobals());

it("defaults real roots open and virtual roots closed, and restores user expansion", () => {
  const storage = new Map<string, string>();
  vi.stubGlobal("sessionStorage", {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
  });
  let handlers: ReturnType<typeof useExpandedGroups>;
  function Harness() {
    handlers = useExpandedGroups(
      "test",
      (data) => !!data && typeof data === "object" && "virtual" in data,
    );
    return null;
  }
  renderToStaticMarkup(createElement(Harness));
  const isOpen = (key: string, data: object, level = 0) =>
    handlers.isGroupOpenByDefault({
      rowNode: { key, data, level },
    } as Parameters<typeof handlers.isGroupOpenByDefault>[0]);
  expect(isOpen("real", {})).toBe(true);
  expect(isOpen("virtual", { virtual: true })).toBe(false);
  expect(isOpen("nested", {}, 1)).toBe(false);
  storage.set("test", "invalid");
  expect(isOpen("virtual", { virtual: true })).toBe(false);
  expect(storage.has("test")).toBe(false);
  handlers!.onRowGroupOpened({
    api: {
      forEachNode: (visit: (node: object) => void) => {
        visit({ group: true, expanded: true, key: "virtual" });
        visit({ group: true, expanded: false, key: "real" });
      },
    },
  } as Parameters<typeof handlers.onRowGroupOpened>[0]);
  expect(isOpen("virtual", { virtual: true })).toBe(true);
  expect(isOpen("real", {})).toBe(false);
});

it.each([false, true])(
  "preserves hidden group choices only when requested (%s)",
  (preserveMissingGroups) => {
    const storage = new Map<string, string>([
      ["categories", JSON.stringify(["hidden-archived", "visible-closed"])],
    ]);
    vi.stubGlobal("sessionStorage", {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
    });
    let handlers: ReturnType<typeof useExpandedGroups>;
    function Harness() {
      handlers = useExpandedGroups(
        "categories",
        undefined,
        preserveMissingGroups,
      );
      return null;
    }
    renderToStaticMarkup(createElement(Harness));
    handlers!.onRowGroupOpened({
      api: {
        forEachNode: (visit: (node: object) => void) => {
          visit({ group: true, expanded: true, key: "visible-open" });
          visit({ group: true, expanded: false, key: "visible-closed" });
        },
      },
    } as Parameters<typeof handlers.onRowGroupOpened>[0]);
    expect(JSON.parse(storage.get("categories")!)).toEqual(
      preserveMissingGroups
        ? ["visible-open", "hidden-archived"]
        : ["visible-open"],
    );
  },
);
