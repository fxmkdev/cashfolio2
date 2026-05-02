import { getUserAccountBooks, type UserAccountBookOption } from "@/server/home";

let cachedAccountBooksPromise: Promise<UserAccountBookOption[]> | null = null;

export function loadUserAccountBooksForAccountsRoute() {
  if (typeof window === "undefined") {
    return getUserAccountBooks();
  }

  if (!cachedAccountBooksPromise) {
    cachedAccountBooksPromise = getUserAccountBooks().catch((error) => {
      cachedAccountBooksPromise = null;
      throw error;
    });
  }

  return cachedAccountBooksPromise;
}

export function resetCachedUserAccountBooksForTests() {
  cachedAccountBooksPromise = null;
}
