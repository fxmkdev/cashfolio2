import type { ClassificationNode } from "./asset-class";
import { validateAccountGroupName } from "./account-validation";
export function validateClassificationChange(
  nodes: readonly ClassificationNode[],
  data: { id?: string; name: string; parentId: string | null },
) {
  const current = data.id ? nodes.find((n) => n.id === data.id) : undefined;
  if (data.id && !current)
    throw new Error(
      "This asset class is no longer available. Refresh and try again.",
    );
  if (data.parentId && !nodes.some((n) => n.id === data.parentId))
    throw new Error(
      "The selected parent is no longer available. Refresh and choose another parent.",
    );
  let parentId = data.parentId;
  const seen = new Set<string>();
  while (parentId) {
    if (parentId === data.id || seen.has(parentId))
      throw new Error(
        "An asset class cannot be moved under itself or one of its descendants.",
      );
    seen.add(parentId);
    parentId = nodes.find((n) => n.id === parentId)?.parentId ?? null;
  }
  const nameError = validateAccountGroupName(
    data.name.trim(),
    nodes
      .filter((n) => n.parentId === data.parentId && n.id !== data.id)
      .map((n) => n.name),
  );
  if (nameError) throw new Error(nameError);
}
