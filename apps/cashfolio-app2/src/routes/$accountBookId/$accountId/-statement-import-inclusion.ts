import type { StatementImportDraft } from "./-statement-import";

export function getStatementImportInclusionRange(args: {
  displayedDraftIds: string[];
  anchorDraftId: string | undefined;
  endpointDraftId: string;
}): string[] {
  const anchorIndex = args.anchorDraftId
    ? args.displayedDraftIds.indexOf(args.anchorDraftId)
    : -1;
  const endpointIndex = args.displayedDraftIds.indexOf(args.endpointDraftId);
  if (anchorIndex < 0 || endpointIndex < 0) return [];
  return args.displayedDraftIds.slice(
    Math.min(anchorIndex, endpointIndex),
    Math.max(anchorIndex, endpointIndex) + 1,
  );
}

export function setStatementImportRangeInclusion(args: {
  drafts: StatementImportDraft[];
  draftIds: string[];
  included: boolean;
}): StatementImportDraft[] {
  const ids = new Set(args.draftIds);
  let changed = false;
  const drafts = args.drafts.map((draft) => {
    if (!ids.has(draft.id) || draft.ignored === !args.included) return draft;
    changed = true;
    return { ...draft, ignored: !args.included };
  });
  return changed ? drafts : args.drafts;
}
