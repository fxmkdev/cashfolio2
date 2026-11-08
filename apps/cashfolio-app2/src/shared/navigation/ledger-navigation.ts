export type LedgerReturnTarget = {
  href: string;
  label: string;
  historyIndex?: number;
};

const sectionLabels: Record<string, string> = {
  accounts: "Accounts",
  transactions: "Transactions",
  report: "Report",
  history: "History",
};

function getSourceLabel(
  href: string,
  accountBookId: string,
  ledgerName?: string,
) {
  if (!href.startsWith("/") || href.startsWith("//") || href.includes("\\"))
    return null;
  const url = new URL(href, "https://cashfolio.local");
  const segments = url.pathname.split("/").filter(Boolean);
  if (segments[0] !== accountBookId) return null;
  if (segments.length === 2 && Object.hasOwn(sectionLabels, segments[1]))
    return sectionLabels[segments[1]];
  if (
    segments.length === 4 &&
    segments[1] === "report" &&
    segments[2] === "gains-losses"
  )
    return "Report";
  if (
    segments.length === 3 &&
    segments[1] === "settings" &&
    segments[2] === "categories"
  )
    return "Categories";
  if (
    segments.length === 2 &&
    !["settings", "user-settings"].includes(segments[1]) &&
    ledgerName
  )
    return ledgerName;
  return null;
}

export function createLedgerReturnTarget(args: {
  accountBookId: string;
  href: string;
  ledgerName?: string;
  historyIndex?: number;
}): LedgerReturnTarget | null {
  const label = getSourceLabel(args.href, args.accountBookId, args.ledgerName);
  if (!label) return null;
  return {
    href: args.href,
    label,
    ...(Number.isSafeInteger(args.historyIndex) && args.historyIndex! >= 0
      ? { historyIndex: args.historyIndex }
      : {}),
  };
}

export function parseLedgerReturnTarget(
  value: unknown,
  accountBookId: string,
): LedgerReturnTarget | null {
  if (typeof value !== "object" || value === null) return null;
  const target = value as Record<string, unknown>;
  if (typeof target.href !== "string" || typeof target.label !== "string")
    return null;
  return createLedgerReturnTarget({
    accountBookId,
    href: target.href,
    ledgerName: target.label,
    historyIndex:
      typeof target.historyIndex === "number" ? target.historyIndex : undefined,
  });
}

export function getLedgerReturnDelta(
  target: LedgerReturnTarget,
  currentIndex: number | undefined,
): number | null {
  return Number.isSafeInteger(currentIndex) &&
    target.historyIndex != null &&
    currentIndex! > target.historyIndex
    ? target.historyIndex - currentIndex!
    : null;
}
