import {
  ActionIcon,
  Badge,
  Button,
  Checkbox,
  Group,
  Modal,
  Stack,
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
  if (roles.length === 0) {
    return (
      <Text c="dimmed" size="sm">
        None
      </Text>
    );
  }

  return (
    <Group gap={4} h="100%" align="center">
      {roles.includes(UserRole.ADMIN) && (
        <Badge radius="xl" variant="light">
          Admin
        </Badge>
      )}
    </Group>
  );
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
        field: "externalId",
        headerName: "External ID",
        minWidth: 260,
        flex: 1,
        filter: "agTextColumnFilter",
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
        field: "locale",
        headerName: "Locale",
        width: 130,
        valueFormatter: ({ value }) => value ?? "",
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
        width: 170,
        type: "dateString",
      },
      {
        field: "updatedAt",
        headerName: "Updated",
        width: 170,
        type: "dateString",
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
              <Text fw={500}>{managingUser.externalId}</Text>
            </Stack>

            <Checkbox
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
