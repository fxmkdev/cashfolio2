export type OrganizeReturnTarget = {
  accountBookId: string;
  href: string;
  historyIndex: number;
};

function accountsUrl(href: unknown, accountBookId: string) {
  if (
    typeof href !== "string" ||
    !href.startsWith("/") ||
    href.startsWith("//") ||
    href.includes("\\")
  )
    return undefined;
  const url = new URL(href, "https://cashfolio.invalid");
  if (url.pathname !== `/${encodeURIComponent(accountBookId)}/accounts`)
    return undefined;
  if (
    url.searchParams.get("tab") !== "BALANCE" ||
    url.searchParams.get("mode") !== "active" ||
    url.searchParams.get("grouping") === "assetClass"
  )
    return undefined;
  return url;
}

export function createOrganizeReturnTarget(
  accountBookId: string,
  href: string,
  historyIndex: number,
): OrganizeReturnTarget | undefined {
  const url = accountsUrl(href, accountBookId);
  if (
    !url ||
    url.searchParams.has("organize") ||
    !Number.isSafeInteger(historyIndex) ||
    historyIndex < 0
  )
    return undefined;
  return { accountBookId, href, historyIndex };
}

/** Only traverse to the adjacent, same-book normal Accounts entry we created. */
export function getOrganizeReturnDelta(
  target: unknown,
  accountBookId: string,
  currentHref: string,
  currentIndex: number,
): -1 | undefined {
  if (!target || typeof target !== "object") return undefined;
  const candidate = target as Partial<OrganizeReturnTarget>;
  if (
    candidate.accountBookId !== accountBookId ||
    typeof candidate.href !== "string" ||
    typeof candidate.historyIndex !== "number" ||
    !createOrganizeReturnTarget(
      accountBookId,
      candidate.href,
      candidate.historyIndex,
    ) ||
    currentIndex !== candidate.historyIndex + 1
  )
    return undefined;
  const current = accountsUrl(currentHref, accountBookId);
  if (current?.searchParams.get("organize") !== "true") return undefined;
  current.searchParams.delete("organize");
  current.searchParams.sort();
  const origin = new URL(candidate.href, current.origin);
  origin.searchParams.sort();
  return current.href === origin.href ? -1 : undefined;
}
