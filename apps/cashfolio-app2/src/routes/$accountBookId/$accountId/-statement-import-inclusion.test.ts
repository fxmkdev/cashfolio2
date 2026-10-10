import { describe, expect, it } from "vitest";
import { createStatementImportDraft } from "./-statement-import-draft-create";
import { createRow, currentAccount } from "./-statement-import-test-fixtures";
import {
  getStatementImportInclusionRange,
  setStatementImportRangeInclusion,
} from "./-statement-import-inclusion";

describe("statement import inclusion ranges", () => {
  const displayedDraftIds = ["first", "second", "third", "fourth", "fifth"];

  it.each<[string | undefined, string, string[]]>([
    ["second", "fourth", ["second", "third", "fourth"]],
    ["fourth", "second", ["second", "third", "fourth"]],
    ["third", "third", ["third"]],
    [undefined, "third", []],
    ["hidden", "third", []],
    ["third", "hidden", []],
  ])(
    "finds the displayed range from %s to %s",
    (anchorDraftId, endpointDraftId, expected) => {
      expect(
        getStatementImportInclusionRange({
          displayedDraftIds,
          anchorDraftId,
          endpointDraftId,
        }),
      ).toEqual(expected);
    },
  );

  it("uses displayed order instead of draft source order", () => {
    expect(
      getStatementImportInclusionRange({
        displayedDraftIds: ["fourth", "first", "third"],
        anchorDraftId: "fourth",
        endpointDraftId: "third",
      }),
    ).toEqual(["fourth", "first", "third"]);
  });

  function mixedDrafts() {
    return displayedDraftIds.map((id, index) => ({
      ...createStatementImportDraft({
        row: createRow(),
        currentAccount,
        sourceRowNumber: index + 2,
      }),
      id,
      ignored: index % 2 === 0,
    }));
  }

  it.each([true, false])(
    "sets a mixed range to included=%s and preserves outside rows and edits",
    (included) => {
      const drafts = mixedDrafts();
      const result = setStatementImportRangeInclusion({
        drafts,
        draftIds: ["second", "third", "fourth"],
        included,
      });
      expect(result.map((draft) => draft.ignored)).toEqual([
        true,
        !included,
        !included,
        !included,
        true,
      ]);
      expect(result[0]).toBe(drafts[0]);
      expect(result[4]).toBe(drafts[4]);
      result.forEach((draft, index) =>
        expect(draft.transaction).toBe(drafts[index].transaction),
      );
    },
  );

  it("does not restore previous changes when a repeated range is shorter", () => {
    const drafts = mixedDrafts();
    const first = setStatementImportRangeInclusion({
      drafts,
      draftIds: ["second", "third", "fourth"],
      included: false,
    });
    const second = setStatementImportRangeInclusion({
      drafts: first,
      draftIds: ["second", "third"],
      included: false,
    });
    expect(second).toBe(first);
    expect(second[3].ignored).toBe(true);
  });

  it("preserves the draft array when the range is empty or already matches", () => {
    const drafts = mixedDrafts();
    expect(
      setStatementImportRangeInclusion({
        drafts,
        draftIds: [],
        included: true,
      }),
    ).toBe(drafts);
    expect(
      setStatementImportRangeInclusion({
        drafts,
        draftIds: ["first", "third"],
        included: false,
      }),
    ).toBe(drafts);
  });
});
