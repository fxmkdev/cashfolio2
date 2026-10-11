export const ACCOUNT_BOOK_BUSY_MESSAGE =
  "This account book is busy. No changes were saved. Please try again.";

export function getMutationError(error: unknown) {
  const message =
    error instanceof Error ? error.message : "The change could not be saved.";
  const isUncertainOutcome =
    error instanceof TypeError ||
    (error instanceof Error &&
      (error.name === "AbortError" ||
        /failed to fetch|network error|networkerror|load failed|fetch failed/i.test(
          message,
        )));
  return {
    message: isUncertainOutcome
      ? "We could not confirm whether your change was saved. Refresh and check the saved data before submitting again."
      : message,
    isBusy: message === ACCOUNT_BOOK_BUSY_MESSAGE,
    isUncertainOutcome,
  };
}
