import {
  ActionIcon,
  Avatar,
  Badge,
  Button,
  Group,
  Modal,
  Stack,
  Switch,
  Text,
  Title,
  Tooltip,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconCheck, IconUserCog } from "@tabler/icons-react";
import type { ColDef, ICellRendererParams } from "ag-grid-enterprise";
import { useMemo, useState } from "react";
import { UserRole } from "@/.prisma-client/enums";
import { DataGrid } from "@/components/data-grid";
import { getGridUserLocale } from "@/components/grid-locale";
import { PageShell } from "@/components/page-shell";
import { TopPageHeader } from "@/components/top-page-header";
import { useDialogSubmitState } from "@/hooks/use-dialog-submit-state";
import type { AdminUserListItem } from "@/server/admin-users";

export type AdminUsersPageViewProps = {
  users: AdminUserListItem[];
  onSubmitRoles: (args: { userId: string; roles: UserRole[] }) => Promise<void>;
};

function showRolesSavedNotification() {
  notifications.show({
    color: "green",
    icon: <IconCheck size={16} />,
    title: "Saved",
    message: "User roles saved.",
    withBorder: true,
  });
}

function UserRolesCell({ roles }: { roles: UserRole[] }) {
  const content = roles.includes(UserRole.ADMIN) ? (
    <Badge radius="xl" variant="light">
      Admin
    </Badge>
  ) : (
    <Text c="dimmed" size="sm">
      None
    </Text>
  );

  return (
    <Group
      align="center"
      data-empty={roles.length === 0 ? "true" : undefined}
      data-testid="admin-user-roles-cell"
      gap={4}
      h="100%"
      wrap="nowrap"
    >
      {content}
    </Group>
  );
}

function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function getIdentityStatusLabel(status: AdminUserListItem["identityStatus"]) {
  if (status === "missing") return "Missing identity";
  if (status === "unavailable") return "Identity unavailable";
  return null;
}

function UserNameCell({ user }: { user: AdminUserListItem }) {
  const statusLabel = getIdentityStatusLabel(user.identityStatus);

  return (
    <Group gap="sm" h="100%" align="center" wrap="nowrap">
      <Avatar alt={user.displayName} radius="xl" size="sm" src={user.avatarUrl}>
        {getInitials(user.displayName)}
      </Avatar>
      <Stack gap={0}>
        <Group gap="xs" wrap="nowrap">
          <Text fw={500} size="sm">
            {user.displayName}
          </Text>
          {statusLabel ? (
            <Badge color="gray" size="xs" variant="light">
              {statusLabel}
            </Badge>
          ) : null}
        </Group>
        {user.username ? (
          <Text c="dimmed" size="xs">
            {user.username}
          </Text>
        ) : null}
      </Stack>
    </Group>
  );
}

function UserEmailCell({ email }: { email: string | null }) {
  if (!email) {
    return (
      <Group h="100%" align="center">
        <Text c="dimmed" size="sm">
          No email
        </Text>
      </Group>
    );
  }

  return (
    <Group h="100%" align="center">
      <Text size="sm">{email}</Text>
    </Group>
  );
}

function formatAdminTimestamp(value: unknown, context: unknown) {
  if (typeof value !== "string" || value.length === 0) {
    return "";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat(getGridUserLocale(context), {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(date);
}

function UserActionsCell({
  user,
  onManageRoles,
}: {
  user: AdminUserListItem;
  onManageRoles: (user: AdminUserListItem) => void;
}) {
  return (
    <Group gap={4} wrap="nowrap" h="100%" align="center">
      <Tooltip label="Manage roles">
        <ActionIcon
          variant="subtle"
          size="sm"
          onClick={() => onManageRoles(user)}
          aria-label="Manage roles"
        >
          <IconUserCog size={16} />
        </ActionIcon>
      </Tooltip>
    </Group>
  );
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Failed to save user roles.";
}

export function AdminUsersPageView({
  users,
  onSubmitRoles,
}: AdminUsersPageViewProps) {
  const [managingUser, setManagingUser] = useState<AdminUserListItem | null>(
    null,
  );
  const [adminRoleChecked, setAdminRoleChecked] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const { isSubmitting, runSubmit } = useDialogSubmitState();

  const columnDefs = useMemo<ColDef<AdminUserListItem>[]>(
    () => [
      {
        field: "displayName",
        headerName: "Name",
        minWidth: 280,
        flex: 1,
        filter: "agTextColumnFilter",
        cellRenderer: ({ data }: ICellRendererParams<AdminUserListItem>) =>
          data ? <UserNameCell user={data} /> : null,
      },
      {
        field: "email",
        headerName: "Email",
        minWidth: 240,
        flex: 1,
        filter: "agTextColumnFilter",
        cellRenderer: ({
          value,
        }: ICellRendererParams<AdminUserListItem, string | null>) => (
          <UserEmailCell email={value ?? null} />
        ),
      },
      {
        field: "roles",
        headerName: "Roles",
        width: 160,
        filter: false,
        sortable: false,
        cellRenderer: ({
          value,
        }: ICellRendererParams<AdminUserListItem, UserRole[]>) => (
          <UserRolesCell roles={value ?? []} />
        ),
      },
      {
        field: "accountBookCount",
        headerName: "Account Books",
        width: 150,
        filter: "agNumberColumnFilter",
      },
      {
        field: "createdAt",
        headerName: "Created",
        width: 190,
        valueFormatter: ({ context, value }) =>
          formatAdminTimestamp(value, context),
      },
      {
        field: "updatedAt",
        headerName: "Updated",
        width: 190,
        valueFormatter: ({ context, value }) =>
          formatAdminTimestamp(value, context),
      },
      {
        colId: "actions",
        headerName: "",
        width: 90,
        sortable: false,
        filter: false,
        resizable: false,
        suppressHeaderMenuButton: true,
        cellClass: "actions-cell",
        cellRenderer: ({ data }: ICellRendererParams<AdminUserListItem>) =>
          data ? (
            <UserActionsCell
              user={data}
              onManageRoles={(user) => {
                setManagingUser(user);
                setAdminRoleChecked(user.roles.includes(UserRole.ADMIN));
                setSubmitError(null);
              }}
            />
          ) : null,
      },
    ],
    [],
  );

  const selectedRoles = adminRoleChecked ? [UserRole.ADMIN] : [];

  return (
    <PageShell>
      <TopPageHeader heading={<Title order={2}>Users</Title>} />

      <DataGrid
        containerStyle={{ flex: 1, minHeight: 0 }}
        rowData={users}
        columnDefs={columnDefs}
        defaultColDef={{
          sortable: true,
          filter: true,
          suppressHeaderMenuButton: true,
        }}
        getRowId={({ data }) => data.id}
      />

      <Modal
        opened={!!managingUser}
        onClose={() => {
          if (isSubmitting) return;
          setManagingUser(null);
        }}
        title="Manage roles"
        size="md"
        closeOnEscape={!isSubmitting}
        closeOnClickOutside={!isSubmitting}
        withCloseButton={!isSubmitting}
      >
        {managingUser ? (
          <Stack gap="md">
            <Stack gap={4}>
              <Text size="sm" c="dimmed">
                User
              </Text>
              <Text fw={500}>{managingUser.displayName}</Text>
              {managingUser.email ? (
                <Text c="dimmed" size="sm">
                  {managingUser.email}
                </Text>
              ) : null}
            </Stack>

            <Switch
              label="Admin"
              checked={adminRoleChecked}
              disabled={isSubmitting}
              onChange={(event) => {
                setAdminRoleChecked(event.currentTarget.checked);
                setSubmitError(null);
              }}
            />

            {submitError ? (
              <Text c="red" size="sm">
                {submitError}
              </Text>
            ) : null}

            <Group justify="flex-end">
              <Button
                variant="default"
                disabled={isSubmitting}
                onClick={() => setManagingUser(null)}
              >
                Cancel
              </Button>
              <Button
                loading={isSubmitting}
                onClick={() => {
                  void runSubmit(async () => {
                    try {
                      await onSubmitRoles({
                        userId: managingUser.id,
                        roles: selectedRoles,
                      });
                      showRolesSavedNotification();
                      setManagingUser(null);
                    } catch (error) {
                      setSubmitError(getErrorMessage(error));
                    }
                  });
                }}
              >
                Save
              </Button>
            </Group>
          </Stack>
        ) : null}
      </Modal>
    </PageShell>
  );
}
