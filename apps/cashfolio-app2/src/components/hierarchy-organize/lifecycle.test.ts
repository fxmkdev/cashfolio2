import { expect, it } from "vitest";
import { bulkStatusAction, bulkLifecycleAvailability } from "./lifecycle";
import { createOrganizerStoryApi } from "./story-fixtures";
import type { OrganizeNodeRef } from "@/shared/hierarchy-organize/types";

it.each([
  { ids: ["checking"], archived: true, expected: "unarchive" },
  { ids: ["empty"], archived: true, expected: "unarchive" },
  { ids: ["checking", "empty"], archived: true, expected: "unarchive" },
  { ids: ["checking", "empty"], archived: false, expected: "archive" },
  { ids: ["checking", "archived"], archived: false, expected: "archive" },
  { ids: [], archived: true, expected: "archive" },
])(
  "chooses $expected for $ids with archived=$archived",
  async ({ ids, archived, expected }) => {
    const api = createOrganizerStoryApi();
    const snapshot = await api.load();
    if (archived) for (const node of snapshot.nodes) node.isActive = false;
    const selected = snapshot.nodes.filter((node) => ids.includes(node.id));
    expect(bulkStatusAction(snapshot, selected)).toBe(expected);
  },
);

it("shows Unarchive independently of an archived ancestor's eligibility restrictions", async () => {
  const snapshot = await createOrganizerStoryApi().load();
  const selected: OrganizeNodeRef[] = [
    { id: "nested", nodeType: "accountGroup" },
    { id: "holding", nodeType: "account" },
  ];
  for (const node of snapshot.nodes) node.isActive = false;
  snapshot.actionAvailability.holding.unarchivable = false;
  snapshot.actionAvailability.holding.unarchiveDisabledReason =
    "Its parent group is archived";
  snapshot.actionAvailability.nested.unarchivable = true;
  expect(bulkStatusAction(snapshot, selected)).toBe("unarchive");
  expect(bulkLifecycleAvailability(snapshot, selected, "unarchive")).toEqual({
    enabled: false,
    reason: "Fund: Its parent group is archived",
  });
});

it("does not infer archived status from missing or mismatched rows", async () => {
  const snapshot = await createOrganizerStoryApi().load();
  const archived = { id: "archived", nodeType: "account" as const };
  for (const selected of [
    [archived, { id: "missing", nodeType: "account" as const }],
    [{ ...archived, nodeType: "accountGroup" as const }],
  ])
    expect(bulkStatusAction(snapshot, selected)).toBe("archive");
});
