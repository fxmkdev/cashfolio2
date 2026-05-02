export type AccountBookTopNavigationSection =
  | "accounts"
  | "period"
  | "timeline"
  | "valuation-cache";

function getPathWithinAccountBook(args: {
  accountBookId: string;
  pathname: string;
}): string {
  const accountBookPrefix = `/${args.accountBookId}`;

  if (!args.pathname.startsWith(accountBookPrefix)) {
    return args.pathname;
  }

  const pathWithinBook = args.pathname.slice(accountBookPrefix.length);
  return pathWithinBook.length === 0 ? "/" : pathWithinBook;
}

export function getAccountBookTopNavigationSection(args: {
  accountBookId: string;
  pathname: string;
}): AccountBookTopNavigationSection {
  const pathWithinBook = getPathWithinAccountBook(args);

  if (pathWithinBook === "/period" || pathWithinBook.startsWith("/period/")) {
    return "period";
  }

  if (
    pathWithinBook === "/timeline" ||
    pathWithinBook.startsWith("/timeline/")
  ) {
    return "timeline";
  }

  if (
    pathWithinBook === "/valuation-cache" ||
    pathWithinBook.startsWith("/valuation-cache/")
  ) {
    return "valuation-cache";
  }

  return "accounts";
}
