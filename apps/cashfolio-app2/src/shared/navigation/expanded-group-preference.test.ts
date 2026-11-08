import { describe, expect, it, vi } from "vitest";
import { readExpandedGroupPreference } from "./expanded-group-preference";

function storage(values: Record<string, string>) {
  const entries = new Map(Object.entries(values));
  return {
    getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => {
      entries.set(key, value);
    },
    removeItem: (key: string) => {
      entries.delete(key);
    },
  };
}

describe("unified expansion preferences", () => {
  it("unions valid legacy IDs once and preserves later collapsed choices", () => {
    const source = storage({
      assets: '["bank","shared",42]',
      liabilities: '["cards","shared"]',
    });
    expect(
      readExpandedGroupPreference(source, "balance", ["assets", "liabilities"]),
    ).toEqual(["bank", "shared", "cards"]);
    source.setItem("balance", "[]");
    expect(
      readExpandedGroupPreference(source, "balance", ["assets", "liabilities"]),
    ).toEqual([]);
  });

  it("uses defaults when nothing valid exists and tolerates unavailable storage", () => {
    expect(
      readExpandedGroupPreference(
        storage({ balance: "oops", assets: "{}" }),
        "balance",
        ["assets"],
      ),
    ).toBeNull();
    const source = storage({});
    source.getItem = vi.fn(() => {
      throw new Error("Storage disabled");
    });
    expect(readExpandedGroupPreference(source, "balance")).toBeNull();
  });
});
