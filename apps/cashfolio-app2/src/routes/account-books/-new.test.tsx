import { createElement, type ComponentType, type FormEvent } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthenticatedUserProfile } from "@/auth/user-profile";
import type { UserAccountBookOption } from "@/server/home";
import type { UserLocale } from "@/user-locale";
import type { NewAccountBookPageViewProps } from "./-new-account-book-page-view";

type PageData = {
  accountBooks: UserAccountBookOption[];
  userProfile: AuthenticatedUserProfile;
  userLocale: UserLocale;
};
type RouteOptions = {
  loader: () => Promise<PageData>;
  validateSearch: (search: Record<string, unknown>) => { returnTo?: string };
  component: ComponentType;
};

const {
  routes,
  captured,
  pageData,
  search,
  createBook,
  invalidate,
  notify,
  navigate,
  getBooks,
  getProfile,
  getLocale,
} = vi.hoisted(() => ({
  routes: new Map<string, RouteOptions>(),
  captured: { view: null as NewAccountBookPageViewProps | null },
  pageData: { value: null as PageData | null },
  search: { value: {} as { returnTo?: string } },
  createBook: vi.fn(),
  invalidate: vi.fn(),
  notify: vi.fn(),
  navigate: vi.fn(),
  getBooks: vi.fn(),
  getProfile: vi.fn(),
  getLocale: vi.fn(),
}));

vi.mock("@tanstack/react-router", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tanstack/react-router")>()),
  createFileRoute: (path: string) => (options: RouteOptions) => {
    routes.set(path, options);
    return {
      useLoaderData: () => pageData.value,
      useSearch: () => search.value,
    };
  },
  useNavigate: () => navigate,
}));
vi.mock("@/server/account-books", () => ({ createAccountBook: createBook }));
vi.mock("@/account-books/options", () => ({
  invalidateCachedUserAccountBooks: invalidate,
}));
vi.mock("@mantine/notifications", () => ({ notifications: { show: notify } }));
vi.mock("@/server/home", () => ({ getUserAccountBooks: getBooks }));
vi.mock("@/server/user-profile", () => ({
  getAuthenticatedUserProfile: getProfile,
  getAuthenticatedUserLocale: getLocale,
}));
vi.mock("./-new-account-book-page-view", () => ({
  NewAccountBookPageView: (props: NewAccountBookPageViewProps) => {
    captured.view = props;
    return null;
  },
}));

import "./new";

function route() {
  const options = routes.get("/account-books/new");
  if (!options) throw new Error("Missing creation route");
  return options;
}

function renderPage() {
  renderToStaticMarkup(createElement(route().component));
  if (!captured.view) throw new Error("Missing controlled view");
  return captured.view;
}

function submit(view: NewAccountBookPageViewProps) {
  view.onSubmit({
    preventDefault: vi.fn(),
  } as unknown as FormEvent<HTMLFormElement>);
}

describe("account-book creation route", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-07T12:00:00Z"));
    captured.view = null;
    search.value = {};
    pageData.value = {
      accountBooks: [{ id: "existing", name: "Existing Book" }],
      userProfile: { displayName: "Ada", avatarUrl: null, initials: "A" },
      userLocale: "de-CH",
    };
    getBooks.mockResolvedValue(pageData.value.accountBooks);
    getProfile.mockResolvedValue(pageData.value.userProfile);
    getLocale.mockResolvedValue(pageData.value.userLocale);
    createBook.mockResolvedValue({ id: "created-book" });
  });

  afterEach(() => vi.useRealTimers());

  it("loads books, profile, and locale directly from the server", async () => {
    expect(await route().loader()).toEqual(pageData.value);
    expect(getBooks).toHaveBeenCalledOnce();
    expect(getProfile).toHaveBeenCalledOnce();
    expect(getLocale).toHaveBeenCalledOnce();
  });

  it("preserves returnTo parsing and passes controlled defaults and locale", () => {
    expect(
      route().validateSearch({
        returnTo: "/existing/report?period=2026-01#rows",
      }),
    ).toEqual({
      returnTo: "/existing/report?period=2026-01#rows",
    });
    expect(route().validateSearch({ returnTo: "" })).toEqual({});
    expect(route().validateSearch({ returnTo: 12 })).toEqual({});
    const view = renderPage();
    expect(view.form.getValues()).toEqual({
      name: "",
      referenceCurrency: "CHF",
      startDate: new Date("2026-11-01T00:00:00Z"),
    });
    expect(view.userLocale).toBe("de-CH");
    expect(view.maxDate).toEqual(new Date("2026-11-07T00:00:00Z"));
  });

  it.each([
    [{ name: " " }, "name", "Account book name is required"],
    [{ name: "x".repeat(256) }, "name", "Name cannot exceed 255 characters."],
    [
      { referenceCurrency: null },
      "referenceCurrency",
      "Reference currency is required",
    ],
    [{ startDate: null }, "startDate", "Start date is required"],
    [{ startDate: "invalid" }, "startDate", "Start date is invalid"],
    [
      { startDate: "2026-11-08" },
      "startDate",
      "Start date cannot be in the future",
    ],
  ])(
    "rejects invalid form values %j before mutation",
    (values, field, message) => {
      const view = renderPage();
      view.form.setValues({ name: "Household", ...values });
      expect(view.form.validate()).toMatchObject({
        hasErrors: true,
        errors: { [field]: message },
      });
      submit(view);
      expect(createBook).not.toHaveBeenCalled();
      expect(invalidate).not.toHaveBeenCalled();
      expect(navigate).not.toHaveBeenCalled();
    },
  );

  it("normalizes the payload, invalidates, notifies, then navigates", async () => {
    const view = renderPage();
    view.form.setValues({
      name: "  Household  ",
      startDate: new Date("2026-01-15T14:35:00Z"),
    });
    submit(view);
    await vi.waitFor(() =>
      expect(navigate).toHaveBeenCalledExactlyOnceWith({
        to: "/$accountBookId/accounts",
        params: { accountBookId: "created-book" },
        search: { tab: "BALANCE", mode: "active" },
      }),
    );
    expect(createBook).toHaveBeenCalledExactlyOnceWith({
      data: {
        name: "Household",
        referenceCurrency: "CHF",
        startDate: "2026-01-15T00:00:00.000Z",
      },
    });
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({ message: "Account book created." }),
    );
    expect(createBook.mock.invocationCallOrder[0]).toBeLessThan(
      invalidate.mock.invocationCallOrder[0],
    );
    expect(invalidate.mock.invocationCallOrder[0]).toBeLessThan(
      notify.mock.invocationCallOrder[0],
    );
    expect(notify.mock.invocationCallOrder[0]).toBeLessThan(
      navigate.mock.invocationCallOrder[0],
    );
  });

  it("guards duplicate submissions while creation is pending", async () => {
    let resolveCreation!: (created: { id: string }) => void;
    createBook.mockReturnValue(
      new Promise<{ id: string }>((resolve) => {
        resolveCreation = resolve;
      }),
    );
    const view = renderPage();
    view.form.setFieldValue("name", "Household");
    submit(view);
    submit(view);
    await vi.waitFor(() => expect(createBook).toHaveBeenCalledOnce());
    expect(invalidate).not.toHaveBeenCalled();
    resolveCreation({ id: "created-book" });
    await vi.waitFor(() => expect(navigate).toHaveBeenCalledOnce());
  });

  it("does not invalidate, notify, or navigate after creation fails", async () => {
    createBook.mockRejectedValue(new Error("Creation failed"));
    const view = renderPage();
    view.form.setFieldValue("name", "Household");
    submit(view);
    await vi.waitFor(() => expect(createBook).toHaveBeenCalledOnce());
    expect(invalidate).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
  });
});
