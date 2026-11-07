import type { UserAccountBookOption } from "@/server/home";

// Share options across browser navigations; SSR always fetches per request.
let cachedAccountBooksPromise: Promise<UserAccountBookOption[]> | null = null;

export async function loadUserAccountBooks() {
  const { getUserAccountBooks } = await import("@/server/home");

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

export function invalidateCachedUserAccountBooks() {
  cachedAccountBooksPromise = null;
}

export function resetCachedUserAccountBooksForTests() {
  invalidateCachedUserAccountBooks();
}
