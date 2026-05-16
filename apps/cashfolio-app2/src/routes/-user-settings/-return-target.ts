import type { UserAccountBookOption } from "@/server/home";

export type UserSettingsReturnTarget = {
  href: string;
  label: string;
};

export function parseUserSettingsSearch(search: Record<string, unknown>): {
  returnTo?: string;
} {
  return typeof search.returnTo === "string" && search.returnTo.length > 0
    ? { returnTo: search.returnTo }
    : {};
}

export function resolveUserSettingsReturnTarget({
  accountBooks,
  returnTo,
}: {
  accountBooks: UserAccountBookOption[];
  returnTo: string | undefined;
}): UserSettingsReturnTarget | null {
  if (!returnTo || !returnTo.startsWith("/") || returnTo.startsWith("//")) {
    return null;
  }

  let url: URL;
  try {
    url = new URL(returnTo, "https://cashfolio.local");
  } catch {
    return null;
  }

  if (url.origin !== "https://cashfolio.local") {
    return null;
  }

  const [firstSegment] = url.pathname.split("/").filter(Boolean);
  const href = `${url.pathname}${url.search}${url.hash}`;

  if (firstSegment === "admin") {
    return {
      href,
      label: "Back to Admin",
    };
  }

  const accountBook = accountBooks.find(({ id }) => id === firstSegment);
  if (!accountBook) {
    return null;
  }

  return {
    href,
    label: `Back to ${accountBook.name}`,
  };
}
