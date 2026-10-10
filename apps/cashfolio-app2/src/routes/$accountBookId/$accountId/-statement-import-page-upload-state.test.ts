import { beforeEach, describe, expect, it, vi } from "vitest";
import { AccountType } from "@/.prisma-client/enums";
import type { StatementImportExistingBooking } from "@/server/statement-import";
import type { StatementImportDraft } from "./-statement-import";
import { STATEMENT_IMPORT_CSV_HEADERS } from "./-statement-import";
import { currentAccount } from "./-statement-import-test-fixtures";

// Exercise the upload hook's async lifecycle with retained state across renders.
const harness = vi.hoisted(() => ({
  states: [] as unknown[],
  cursor: 0,
  requestId: { current: 0 },
  lookup: vi.fn(),
}));
vi.mock("react", () => ({
  useRef: () => harness.requestId,
  useState: (initial: unknown) => {
    const index = harness.cursor++;
    if (!(index in harness.states)) harness.states[index] = initial;
    return [
      harness.states[index],
      (value: unknown) => {
        harness.states[index] = value;
      },
    ];
  },
}));
vi.mock("@/server/statement-import", () => ({
  getStatementImportExistingBookings: harness.lookup,
}));
import { useStatementImportUploadState } from "./-statement-import-page-upload-state";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
function file(description = "Statement", date = "2026-02-03") {
  return new File(
    [
      `date,amount,original amount,original currency,exchange rate,description\n${date},100.25,,,,${description}`,
    ],
    "statement.csv",
  );
}

function setup() {
  let drafts: StatementImportDraft[] = [];
  let existingBookings: StatementImportExistingBooking[] = [];
  const setExistingBookings = vi.fn(
    (bookings: StatementImportExistingBooking[]) => {
      existingBookings = bookings;
    },
  );
  const setDrafts = vi.fn((next) => {
    drafts = typeof next === "function" ? next(drafts) : next;
  });
  const clearEditingDraft = vi.fn();
  const requestConfirmation = vi.fn<(action: () => void) => void>();
  let busy = false;
  function useUploadHarness() {
    harness.cursor = 0;
    return useStatementImportUploadState({
      accountBookId: "book-1",
      account: {
        ...currentAccount,
        name: "Cash",
        type: AccountType.ASSET,
        equityAccountSubtype: null,
        isActive: true,
        statementImportCsvFormat: null,
        isCashAccount: true,
        groupPathSegments: [],
      },
      statementImportCsvFormat: {
        hasHeader: true,
        delimitersToGuess: [","],
        columns: STATEMENT_IMPORT_CSV_HEADERS,
      },
      draftsLength: drafts.length,
      isSubmitting: busy,
      isEditSubmitting: false,
      setDrafts,
      setExistingBookings,
      clearEditingDraft,
      requestConfirmation,
    });
  }
  return {
    render: useUploadHarness,
    setDrafts,
    clearEditingDraft,
    requestConfirmation,
    getDrafts: () => drafts,
    getExistingBookings: () => existingBookings,
    setBusy: (value: boolean) => {
      busy = value;
    },
  };
}

describe("statement import upload", () => {
  beforeEach(() => {
    harness.states = [];
    harness.cursor = 0;
    harness.requestId.current = 0;
    harness.lookup.mockReset().mockResolvedValue([]);
  });

  it("waits for matching before opening review and automatically ignores matches", async () => {
    const lookup = deferred<StatementImportExistingBooking[]>();
    harness.lookup.mockReturnValue(lookup.promise);
    const state = setup();
    const pending = state.render().handleFileChange(file());
    await vi.waitFor(() => expect(harness.lookup).toHaveBeenCalled());
    expect(state.render()).toMatchObject({
      activeStep: "upload",
      isCheckingExistingBookings: true,
      canReviewStatementImport: false,
    });
    expect(state.getDrafts()).toEqual([]);
    expect(state.getExistingBookings()).toEqual([]);
    expect(harness.lookup).toHaveBeenCalledWith({
      data: {
        accountBookId: "book-1",
        accountId: "asset-1",
      },
    });
    lookup.resolve([
      {
        id: "b1",
        transactionId: "t1",
        date: "2026-02-03",
        amount: "100.25",
        description: "Edited",
      },
    ]);
    await pending;
    expect(state.render()).toMatchObject({
      activeStep: "review",
      isCheckingExistingBookings: false,
      canReviewStatementImport: true,
    });
    expect(state.getDrafts()[0].ignored).toBe(true);
    expect(state.getExistingBookings()).toHaveLength(1);
    await state.render().handleFileChange(null);
    expect(state.getExistingBookings()).toEqual([]);
  });

  it("stays on upload with retry instructions when the lookup fails", async () => {
    harness.lookup.mockRejectedValue(new Error("Offline"));
    const state = setup();
    await state.render().handleFileChange(file());
    expect(state.render()).toMatchObject({
      activeStep: "upload",
      isCheckingExistingBookings: false,
      canReviewStatementImport: false,
    });
    expect(state.render().parseErrors.join()).toContain(
      "upload the file again to retry",
    );
    expect(state.getDrafts()).toEqual([]);
    expect(state.getExistingBookings()).toEqual([]);
  });

  it("does not check invalid CSV", async () => {
    const state = setup();
    await state.render().handleFileChange(file("Bad", "invalid"));
    expect(harness.lookup).not.toHaveBeenCalled();
    expect(state.render().parseErrors.length).toBeGreaterThan(0);
    expect(state.render().isCheckingExistingBookings).toBe(false);
  });

  it.each(["success", "failure"])(
    "discards an outdated lookup %s after a new upload",
    async (outcome) => {
      const old = deferred<StatementImportExistingBooking[]>();
      harness.lookup.mockReturnValueOnce(old.promise);
      const state = setup();
      const first = state.render().handleFileChange(file("Old"));
      await vi.waitFor(() => expect(harness.lookup).toHaveBeenCalledTimes(1));
      await state.render().handleFileChange(file("New"));
      if (outcome === "success")
        old.resolve([
          {
            id: "old",
            transactionId: "old-tx",
            date: "2026-02-03",
            amount: "100.25",
            description: "Old",
          },
        ]);
      else old.reject(new Error("Old failure"));
      await first;
      expect(state.getExistingBookings()).toEqual([]);
      expect(state.getDrafts().map((draft) => draft.description)).toEqual([
        "New",
      ]);
      expect(state.render()).toMatchObject({
        activeStep: "review",
        parseErrors: [],
        isCheckingExistingBookings: false,
      });
    },
  );

  it("ignores a pending lookup after the file is cleared", async () => {
    const old = deferred<StatementImportExistingBooking[]>();
    harness.lookup.mockReturnValueOnce(old.promise);
    const state = setup();
    const pending = state.render().handleFileChange(file());
    await vi.waitFor(() => expect(harness.lookup).toHaveBeenCalled());
    await state.render().handleFileChange(null);
    old.resolve([]);
    await pending;
    expect(state.getDrafts()).toEqual([]);
    expect(state.getExistingBookings()).toEqual([]);
    expect(state.render()).toMatchObject({
      file: null,
      activeStep: "upload",
      isCheckingExistingBookings: false,
    });
  });

  it("ignores a file read after the upload is reset", async () => {
    const read = deferred<string>();
    const oldFile = file();
    vi.spyOn(oldFile, "text").mockReturnValue(read.promise);
    const state = setup();
    const pending = state.render().handleFileChange(oldFile);
    state.render().resetStatementImportReview();
    read.resolve("anything");
    await pending;
    expect(harness.lookup).not.toHaveBeenCalled();
    expect(state.render()).toMatchObject({
      file: null,
      activeStep: "upload",
      canReviewStatementImport: false,
    });
  });

  it("preserves reviewed drafts and history until upload discard is confirmed", async () => {
    harness.lookup.mockResolvedValue([
      {
        id: "opening",
        transactionId: "opening-tx",
        date: "2026-01-01",
        amount: "50",
        description: "Opening",
      },
    ]);
    const state = setup();
    state.render().handleStepClick(1);
    expect(state.render().activeStep).toBe("upload");
    await state.render().handleFileChange(file());
    state.setBusy(true);
    state.render().handleStepClick(0);
    expect(state.requestConfirmation).not.toHaveBeenCalled();
    state.setBusy(false);
    state.render().handleStepClick(0);
    expect(state.requestConfirmation).toHaveBeenCalledTimes(1);
    expect(state.getDrafts()).toHaveLength(1);
    expect(state.getExistingBookings()).toHaveLength(1);
    state.requestConfirmation.mock.calls[0][0]();
    expect(state.getDrafts()).toEqual([]);
    expect(state.getExistingBookings()).toEqual([]);
    expect(state.render()).toMatchObject({
      file: null,
      activeStep: "upload",
    });
  });
});
