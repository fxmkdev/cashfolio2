import { MantineProvider } from "@mantine/core";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { useDialogSubmitState } from "../hooks/use-dialog-submit-state";
import {
  ACCOUNT_BOOK_BUSY_MESSAGE,
  getMutationError,
} from "../shared/mutation-errors";
import { MutationSubmitFeedback } from "./mutation-submit-feedback";

function render(
  overrides: Partial<ReturnType<typeof useDialogSubmitState>>,
  canRefresh = true,
) {
  const refresh = vi.fn(async () => {});
  return renderToStaticMarkup(
    <MantineProvider>
      <MutationSubmitFeedback
        state={{
          isSubmitting: false,
          isWaiting: false,
          isRefreshing: false,
          submissionError: null,
          refreshError: null,
          refreshConstraints: refresh,
          clearSubmissionError: vi.fn(),
          runSubmit: vi.fn(async () => true),
          ...overrides,
        }}
        onRefreshConstraints={canRefresh ? refresh : undefined}
      />
    </MantineProvider>,
  );
}
describe("mutation submission feedback", () => {
  it("shows delayed waiting feedback without clearing a draft", () => {
    expect(render({ isSubmitting: true, isWaiting: true })).toContain(
      "Waiting for another change to finish…",
    );
    expect(render({ isSubmitting: true })).not.toContain(
      "Waiting for another change",
    );
  });
  it("offers an explicit retry only for confirmed rollback", () => {
    const busy = render({
      submissionError: getMutationError(new Error(ACCOUNT_BOOK_BUSY_MESSAGE)),
    });
    expect(busy).toContain(ACCOUNT_BOOK_BUSY_MESSAGE);
    expect(busy).toContain("Try again");
    expect(busy).toContain('type="submit"');
    const network = render({
      submissionError: getMutationError(new TypeError("Failed to fetch")),
    });
    expect(network).toContain("check the saved data before submitting again");
    expect(network).not.toContain("Try again");
  });
  it("keeps manual recovery available after clearing the submission error", () => {
    const markup = render({
      refreshError: "Could not refresh choices. Your draft is still here.",
    });
    expect(markup).toContain("Your draft is still here");
    expect(markup).toContain("Refresh choices");
    expect(
      render(
        { submissionError: getMutationError(new Error("Rejected")) },
        false,
      ),
    ).not.toContain("Refresh choices");
  });
});
