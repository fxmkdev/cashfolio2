import { MantineProvider } from "@mantine/core";
import { createElement } from "react";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { UserRole } from "@/.prisma-client/enums";
import type { AdminUserListItem } from "@/server/admin-users";
import { isDeleteUserConfirmationMatch } from "./-users-page-utils";

vi.mock("@/components/grid/data-grid", () => ({
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
    deletionPending: false,
    accountBookCount: 2,
    isCurrentUser: true,
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
    deletionPending: false,
    accountBookCount: 0,
    isCurrentUser: false,
    createdAt: "2026-01-03T00:00:00.000Z",
    updatedAt: "2026-01-04T00:00:00.000Z",
  },
];

describe("AdminUsersPageView", () => {
  it("shows pending deletion and disables role editing while offering retry", () => {
    const pending = {
      ...users[1],
      roles: [UserRole.ADMIN],
      deletionPending: true,
    };
    const markup = renderToStaticMarkup(
      createElement(
        MantineProvider,
        null,
        createElement(AdminUsersPageView, {
          users: [pending],
          onSubmitRoles: vi.fn(),
          onDeleteUser: vi.fn(),
        }),
      ),
    );
    expect(markup).toContain("Deletion pending");
    expect(markup).toContain("Admin (inactive)");
    expect(markup).toContain('aria-label="Retry Deletion"');
    expect(markup).toMatch(
      /<button[^>]*disabled[^>]*aria-label="Manage Roles"/,
    );
  });
  it("renders users, role pills, and role-management actions", () => {
    const markup = renderToStaticMarkup(
      createElement(
        MantineProvider,
        null,
        createElement(AdminUsersPageView, {
          users,
          onSubmitRoles: vi.fn(),
          onDeleteUser: vi.fn(),
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
    expect(markup).toContain("Manage Roles");
    expect(markup).toContain("Delete");
    expect(markup).toContain("disabled");
  });

  it("matches delete confirmation by email when available", () => {
    expect(
      isDeleteUserConfirmationMatch({
        confirmation: " ada@example.test ",
        user: users[0],
      }),
    ).toBe(true);
  });

  it("matches delete confirmation by external id for missing identities", () => {
    expect(
      isDeleteUserConfirmationMatch({
        confirmation: "logto-missing",
        user: users[1],
      }),
    ).toBe(true);
  });
});
