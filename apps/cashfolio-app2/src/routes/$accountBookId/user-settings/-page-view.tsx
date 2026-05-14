import {
  Avatar,
  Button,
  Group,
  Stack,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { notifications } from "@mantine/notifications";
import {
  IconCheck,
  IconExternalLink,
  IconShieldLock,
} from "@tabler/icons-react";
import { useEffect, useState } from "react";
import { PageShell } from "@/components/page-shell";
import { TopPageHeader } from "@/components/top-page-header";
import { useDialogSubmitState } from "@/hooks/use-dialog-submit-state";
import type { loadUserSettingsPageData } from "./-page-loader";

type UserSettingsPageData = Awaited<
  ReturnType<typeof loadUserSettingsPageData>
>;

type UserSettingsFormValues = {
  name: string;
  avatarUrl: string;
};

function validateAvatarUrl(value: string) {
  const normalized = value.trim();
  if (normalized.length === 0) {
    return null;
  }
  if (normalized.length > 2048) {
    return "Avatar URL cannot be longer than 2048 characters.";
  }

  let url: URL;
  try {
    url = new URL(normalized);
  } catch {
    return "Avatar URL must be a valid absolute URL.";
  }

  return url.protocol === "http:" || url.protocol === "https:"
    ? null
    : "Avatar URL must use HTTP or HTTPS.";
}

function showSettingsSavedNotification() {
  notifications.show({
    color: "green",
    icon: <IconCheck size={16} />,
    title: "Saved",
    message: "User settings saved.",
    withBorder: true,
  });
}

export function UserSettingsPageView(args: {
  settings: UserSettingsPageData;
  onSubmit: (values: UserSettingsFormValues) => Promise<void>;
}) {
  const { settings } = args;
  const { isSubmitting, runSubmit } = useDialogSubmitState();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const form = useForm<UserSettingsFormValues>({
    mode: "controlled",
    initialValues: {
      name: settings.name,
      avatarUrl: settings.avatarUrl,
    },
    validate: {
      name: (value) =>
        value.trim().length > 128
          ? "Name cannot be longer than 128 characters."
          : null,
      avatarUrl: validateAvatarUrl,
    },
  });

  useEffect(() => {
    form.setValues({
      name: settings.name,
      avatarUrl: settings.avatarUrl,
    });
    form.resetDirty();
    setSubmitError(null);
    // Mantine's form object is intentionally omitted to reset only when loader data changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings]);

  const avatarUrl = form.values.avatarUrl.trim();

  return (
    <PageShell>
      <TopPageHeader
        heading={<Title order={2}>User Settings</Title>}
        actions={
          <Button
            component="a"
            href={settings.accountSecurityUrl}
            target="_blank"
            rel="noreferrer"
            variant="default"
            leftSection={<IconShieldLock size={16} />}
            rightSection={<IconExternalLink size={16} />}
          >
            Account Security
          </Button>
        }
      />

      <form
        onSubmit={form.onSubmit(async (values) => {
          setSubmitError(null);
          await runSubmit(async () => {
            try {
              await args.onSubmit({
                name: values.name.trim(),
                avatarUrl: values.avatarUrl.trim(),
              });
              showSettingsSavedNotification();
            } catch (error) {
              setSubmitError(
                error instanceof Error
                  ? error.message
                  : "Failed to save user settings.",
              );
            }
          });
        })}
      >
        <Stack gap="md">
          <Group align="center" gap="md">
            <Avatar src={avatarUrl || null} alt="" size={64} radius="xl">
              {settings.initials}
            </Avatar>
            <Stack gap={2}>
              <Text fw={600}>Profile</Text>
              <Text size="sm" c="dimmed">
                Name and avatar are stored in your Logto account.
              </Text>
            </Stack>
          </Group>

          <TextInput
            label="Name"
            disabled={isSubmitting}
            {...form.getInputProps("name")}
          />

          <TextInput
            label="Avatar URL"
            placeholder="https://example.com/avatar.png"
            disabled={isSubmitting}
            {...form.getInputProps("avatarUrl")}
          />

          {submitError && (
            <Text size="sm" c="red">
              {submitError}
            </Text>
          )}

          <Group justify="end">
            <Button
              type="submit"
              loading={isSubmitting}
              disabled={isSubmitting}
            >
              Save
            </Button>
          </Group>
        </Stack>
      </form>
    </PageShell>
  );
}
