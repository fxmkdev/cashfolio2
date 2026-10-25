import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  effect: undefined as (() => (() => void) | void) | undefined,
  getAuthenticationStatus: vi.fn(),
  setIsAuthenticated: vi.fn(),
}));

vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react")>()),
  useState: () => [false, mocks.setIsAuthenticated],
  useEffect: (effect: typeof mocks.effect) => {
    mocks.effect = effect;
  },
}));
vi.mock("@/server/authentication", () => ({
  getAuthenticationStatus: mocks.getAuthenticationStatus,
}));

import { NotFoundPage } from "./-not-found-page";

function mount() {
  const page = NotFoundPage();
  expect(page.props.isAuthenticated).toBe(false);
  return mocks.effect?.();
}

function deferred() {
  let resolve!: (value: boolean) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<boolean>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.effect = undefined;
});

describe("404 authentication check", () => {
  it.each([false, true])(
    "uses authenticated=%s only after confirmation",
    async (isAuthenticated) => {
      const pending = deferred();
      mocks.getAuthenticationStatus.mockReturnValue(pending.promise);
      mount();

      expect(mocks.getAuthenticationStatus).toHaveBeenCalledExactlyOnceWith();
      expect(mocks.setIsAuthenticated).not.toHaveBeenCalled();
      pending.resolve(isAuthenticated);
      await pending.promise;
      expect(mocks.setIsAuthenticated).toHaveBeenCalledExactlyOnceWith(
        isAuthenticated,
      );
    },
  );

  it("keeps Sign Out hidden when the session check fails", async () => {
    mocks.getAuthenticationStatus.mockRejectedValue(
      new Error("Session unavailable"),
    );
    mount();
    await Promise.resolve();
    expect(mocks.setIsAuthenticated).not.toHaveBeenCalled();
  });

  it("ignores confirmation after the page unmounts", async () => {
    const pending = deferred();
    mocks.getAuthenticationStatus.mockReturnValue(pending.promise);
    const unmount = mount();
    unmount?.();
    pending.resolve(true);
    await pending.promise;
    expect(mocks.setIsAuthenticated).not.toHaveBeenCalled();
  });

  it("checks again on every mount rather than reusing an earlier result", async () => {
    mocks.getAuthenticationStatus
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);
    const unmount = mount();
    await Promise.resolve();
    unmount?.();
    mount();
    await Promise.resolve();

    expect(mocks.getAuthenticationStatus).toHaveBeenCalledTimes(2);
    expect(mocks.setIsAuthenticated.mock.calls).toEqual([[true], [false]]);
  });
});
