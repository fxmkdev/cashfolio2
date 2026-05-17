import { MantineProvider } from "@mantine/core";
import { createElement } from "react";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { UserRole } from "@/.prisma-client/enums";

vi.mock("@/components/data-grid", () => ({
  DataGrid: ({
    columnDefs,
    rowData,
  }: {
    columnDefs: {
      colId?: string;
      field?: string;
      headerName?: string;
      cellRenderer?: (params: {
        data: Record<string, unknown>;
        value: unknown;
      }) => ReactNode;
    }[];
    rowData: Record<string, unknown>[];
  }) =>
    createElement(
      "div",
      { "data-testid": "admin-users-grid" },
      columnDefs.map((column) =>
        createElement(
          "span",
          { key: `header-${column.colId ?? column.field}` },
          column.headerName,
        ),
      ),
      rowData.map((row) =>
        createElement(
          "div",
          { key: String(row.id) },
          columnDefs.map((column) => {
            const value = column.field ? row[column.field] : undefined;
            const content = column.cellRenderer
              ? column.cellRenderer({ data: row, value })
              : String(value ?? "");

            return createElement(
              "span",
              { key: `${row.id}-${column.colId ?? column.field}` },
              content,
            );
          }),
        ),
      ),
    ),
}));

import { AdminUsersPageView } from "./-users-page-view";

const users = [
  {
    id: "user-1",
    externalId: "logto-admin",
    roles: [UserRole.ADMIN],
    locale: "en-CH",
    accountBookCount: 2,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-02T00:00:00.000Z",
  },
  {
    id: "user-2",
    externalId: "logto-user",
    roles: [],
    locale: null,
    accountBookCount: 0,
    createdAt: "2026-01-03T00:00:00.000Z",
    updatedAt: "2026-01-04T00:00:00.000Z",
  },
];

describe("AdminUsersPageView", () => {
  it("renders users, role pills, and role-management actions", () => {
    const markup = renderToStaticMarkup(
      createElement(
        MantineProvider,
        null,
        createElement(AdminUsersPageView, {
          users,
          onSubmitRoles: vi.fn(),
        }),
      ),
    );

    expect(markup).toContain("Users");
    expect(markup).toContain("External ID");
    expect(markup).toContain("Roles");
    expect(markup).toContain("Account Books");
    expect(markup).toContain("logto-admin");
    expect(markup).toContain("logto-user");
    expect(markup).toContain("Admin");
    expect(markup).toContain("None");
    expect(markup).toContain("Manage roles");
  });
});
