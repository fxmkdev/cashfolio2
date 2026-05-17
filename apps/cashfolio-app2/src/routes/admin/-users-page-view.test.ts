import { MantineProvider } from "@mantine/core";
import { createElement } from "react";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { UserRole } from "@/.prisma-client/enums";
import type { AdminUserListItem } from "@/server/admin-users";

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
      valueFormatter?: (params: {
        context: Record<string, unknown>;
        value: unknown;
      }) => string;
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
              : column.valueFormatter
                ? column.valueFormatter({
                    context: { userLocale: "en-CH" },
                    value,
                  })
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

const users: AdminUserListItem[] = [
  {
    id: "user-1",
    externalId: "logto-admin",
    displayName: "Ada Lovelace",
    email: "ada@example.test",
    username: "ada",
    avatarUrl: "https://example.test/ada.png",
    identityStatus: "available",
    roles: [UserRole.ADMIN],
    accountBookCount: 2,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-02T00:00:00.000Z",
  },
  {
    id: "user-2",
    externalId: "logto-missing",
    displayName: "logto-missing",
    email: null,
    username: null,
    avatarUrl: null,
    identityStatus: "missing",
    roles: [],
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
    expect(markup).toContain("Name");
    expect(markup).toContain("Email");
    expect(markup).toContain("Roles");
    expect(markup).toContain("Account Books");
    expect(markup).not.toContain("External ID");
    expect(markup).not.toContain("Locale");
    expect(markup).toContain("Ada Lovelace");
    expect(markup).toContain("ada@example.test");
    expect(markup).toContain("Missing identity");
    expect(markup).toContain("No email");
    expect(markup).toContain("Admin");
    expect(markup).toContain("None");
    expect(markup).toContain('data-testid="admin-user-roles-cell"');
    expect(markup).toContain('data-empty="true"');
    expect(markup).toContain("01.01.2026, 00:00");
    expect(markup).toContain("Manage roles");
  });
});
