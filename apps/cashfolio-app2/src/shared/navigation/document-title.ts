const APP_TITLE = "Cashfolio";

export function formatDocumentTitle(pageTitle?: string | null): string {
  const normalizedPageTitle = pageTitle?.trim();

  return normalizedPageTitle
    ? `${normalizedPageTitle} · ${APP_TITLE}`
    : APP_TITLE;
}

export function createDocumentTitleHead(pageTitle?: string | null) {
  return {
    meta: [{ title: formatDocumentTitle(pageTitle) }],
  };
}
