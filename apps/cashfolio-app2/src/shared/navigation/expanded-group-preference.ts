type PreferenceStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function parseIds(value: string | null): string[] | null {
  if (value == null) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((id): id is string => typeof id === "string")
      : null;
  } catch {
    return null;
  }
}

/** Seed a unified preference once; subsequent user choices take precedence. */
export function readExpandedGroupPreference(
  storage: PreferenceStorage,
  key: string,
  legacyKeys: readonly string[] = [],
): string[] | null {
  try {
    const current = storage.getItem(key);
    const ids = parseIds(current);
    if (ids != null) return ids;
    if (current != null) storage.removeItem(key);
    const legacy = legacyKeys
      .map((legacyKey) => parseIds(storage.getItem(legacyKey)))
      .filter((value): value is string[] => value != null);
    if (legacy.length === 0) return null;
    const merged = [...new Set(legacy.flat())];
    storage.setItem(key, JSON.stringify(merged));
    return merged;
  } catch {
    return null;
  }
}
