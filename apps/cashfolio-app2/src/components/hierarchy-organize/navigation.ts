export type OrganizePage = "accounts" | "categories" | "assetClasses";
export function organizeRoute(page: OrganizePage) {
  return page === "categories"
    ? ("/$accountBookId/settings/categories" as const)
    : page === "assetClasses"
      ? ("/$accountBookId/settings/classifications" as const)
      : ("/$accountBookId/accounts" as const);
}
export type OrganizeReturnTarget = {
  accountBookId: string;
  href: string;
  historyIndex: number;
};

function hierarchyUrl(
  href: unknown,
  accountBookId: string,
  page: OrganizePage,
) {
  if (
    typeof href !== "string" ||
    !href.startsWith("/") ||
    href.startsWith("//") ||
    href.includes("\\")
  )
    return undefined;
  const url = new URL(href, "https://cashfolio.invalid");
  if (
    url.pathname !==
    organizeRoute(page).replace(
      "$accountBookId",
      encodeURIComponent(accountBookId),
    )
  )
    return undefined;
  if (
    page === "accounts" &&
    (url.searchParams.get("tab") !== "BALANCE" ||
      (url.searchParams.has("mode") &&
        url.searchParams.get("mode") !== "active") ||
      url.searchParams.get("grouping") === "assetClass")
  )
    return undefined;
  if (page === "accounts") url.searchParams.set("mode", "active");
  if (page === "categories") {
    const tab = url.searchParams.get("tab") ?? "EQUITY-INCOME";
    if (tab !== "EQUITY-INCOME" && tab !== "EQUITY-EXPENSE") return undefined;
    url.searchParams.set("tab", tab);
    if (!url.searchParams.has("showArchived"))
      url.searchParams.set("showArchived", "false");
  }
  return url;
}

export function createOrganizeReturnTarget(
  accountBookId: string,
  href: string,
  historyIndex: number,
  page: OrganizePage = "accounts",
): OrganizeReturnTarget | undefined {
  const url = hierarchyUrl(href, accountBookId, page);
  if (
    !url ||
    url.searchParams.has("organize") ||
    !Number.isSafeInteger(historyIndex) ||
    historyIndex < 0
  )
    return undefined;
  return { accountBookId, href, historyIndex };
}

/** Only traverse to the adjacent, same-book normal hierarchy entry we created. */
export function getOrganizeReturnDelta(
  target: unknown,
  accountBookId: string,
  currentHref: string,
  currentIndex: number,
  page: OrganizePage = "accounts",
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
      page,
    ) ||
    currentIndex !== candidate.historyIndex + 1
  )
    return undefined;
  const current = hierarchyUrl(currentHref, accountBookId, page);
  if (current?.searchParams.get("organize") !== "true") return undefined;
  current.searchParams.delete("organize");
  current.searchParams.sort();
  const origin = hierarchyUrl(candidate.href, accountBookId, page)!;
  origin.searchParams.sort();
  return current.href === origin.href ? -1 : undefined;
}
