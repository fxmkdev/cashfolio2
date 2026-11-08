import { MantineProvider } from "@mantine/core";
import { createElement, type ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { UserDeletionPreview } from "@/shared/users/user-deletion";

type PageData = { deleted: boolean; preview: UserDeletionPreview | null };
type RouteOptions = {
  validateSearch: (search: Record<string, unknown>) => { deleted?: string };
  loader?: (context: { deps: { deleted?: string } }) => Promise<PageData>;
  server: {
    handlers: { POST: (context: { request: Request }) => Promise<Response> };
  };
  component?: ComponentType;
};

const { routes, pageData, getPreview, handleRequest } = vi.hoisted(() => ({
  routes: new Map<string, RouteOptions>(),
  pageData: { value: { deleted: false, preview: null } as PageData },
  getPreview: vi.fn(),
  handleRequest: vi.fn(),
}));

vi.mock("@tanstack/react-router", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tanstack/react-router")>()),
  createFileRoute: (path: string) => (options: RouteOptions) => {
    routes.set(path, options);
    return { useLoaderData: () => pageData.value };
  },
}));
vi.mock("@/server/user-deletion", () => ({
  getUserDeletionPreview: getPreview,
  handleUserDeletionRequest: handleRequest,
}));

import "./delete";

function route(path: string) {
  const options = routes.get(path);
  if (!options) throw new Error(`Missing route ${path}`);
  return options;
}

const preview: UserDeletionPreview = {
  displayName: "Ada",
  accountBooksToDelete: [{ id: "private", name: "Private Book" }],
  accountBooksToUnlink: [{ id: "shared", name: "Shared Book" }],
};

describe("user deletion route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    pageData.value = { deleted: false, preview };
    getPreview.mockResolvedValue(preview);
  });

  it("loads the authenticated preview on the canonical page", async () => {
    expect(await route("/user/delete").loader!({ deps: {} })).toEqual({
      deleted: false,
      preview,
    });
    expect(getPreview).toHaveBeenCalledOnce();
  });

  it("accepts the router's numeric parsing of the success redirect query", () => {
    expect(route("/user/delete").validateSearch({ deleted: "1" })).toEqual({
      deleted: "1",
    });
    expect(route("/user/delete").validateSearch({ deleted: 1 })).toEqual({
      deleted: "1",
    });
    expect(route("/user/delete").validateSearch({ deleted: true })).toEqual({
      deleted: undefined,
    });
  });

  it("renders success without requiring a deleted user's session", async () => {
    pageData.value = await route("/user/delete").loader!({
      deps: { deleted: "1" },
    });
    expect(getPreview).not.toHaveBeenCalled();
    const markup = renderPage();
    expect(markup).toContain("Cashfolio account deleted");
    expect(markup).toContain("sign-in access have been deleted");
    expect(markup).not.toContain("Logto");
  });

  it("delegates POST to the shared handler without redirecting the request", async () => {
    const request = new Request("https://example.test/user/delete", {
      method: "POST",
    });
    const response = new Response(null, {
      status: 302,
      headers: { Location: "/user/delete?deleted=1" },
    });
    handleRequest.mockResolvedValue(response);
    expect(await route("/user/delete").server.handlers.POST({ request })).toBe(
      response,
    );
    expect(handleRequest).toHaveBeenCalledExactlyOnceWith(request);
  });

  it("identifies the Cashfolio identity and both affected-book groups", () => {
    const markup = renderPage();
    expect(markup).toContain("Delete Your Cashfolio Account");
    expect(markup).toContain("Delete My Cashfolio Account");
    expect(markup).toContain('action="/user/delete"');
    expect(markup).toContain('method="post"');
    expect(markup).toContain("Ada");
    expect(markup).toContain("Private Book");
    expect(markup).toContain("Shared Book");
    expect(markup).toContain("sign-in access");
    expect(markup).toContain("books will remain available to other users");
    expect(markup).not.toContain("Logto");
  });

  it("renders nothing when there is no preview", () => {
    pageData.value = { deleted: false, preview: null };
    expect(renderPage()).not.toContain("Delete Your Cashfolio Account");
    expect(renderPage()).not.toContain('action="/user/delete"');
  });
});

function renderPage() {
  return renderToStaticMarkup(
    createElement(
      MantineProvider,
      null,
      createElement(route("/user/delete").component!),
    ),
  );
}
