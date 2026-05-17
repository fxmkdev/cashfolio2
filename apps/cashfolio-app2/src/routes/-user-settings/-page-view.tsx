import {
  Avatar,
  Button,
  Group,
  Select,
  type SelectProps,
  Stack,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { notifications } from "@mantine/notifications";
import { IconArrowLeft, IconCheck } from "@tabler/icons-react";
import { useEffect, useState } from "react";
import { LinkButton } from "@/components/link-button";
import { NarrowPageShell } from "@/components/narrow-page-shell";
import { TopPageHeader } from "@/components/top-page-header";
import { useDialogSubmitState } from "@/hooks/use-dialog-submit-state";
import {
  isSupportedUserLocale,
  resolveSupportedUserLocale,
  USER_LOCALE_OPTION_GROUPS,
  USER_LOCALE_OPTIONS,
  type UserLocale,
} from "@/user-locale";
import type { loadUserSettingsPageData } from "./-page-loader";
import type { UserSettingsReturnTarget } from "./-return-target";

type UserSettingsPageData = Awaited<
  ReturnType<typeof loadUserSettingsPageData>
>;

type UserSettingsFormValues = {
  name: string;
  avatarUrl: string;
  locale: string;
};

const userLocaleOptionByValue = new Map(
  USER_LOCALE_OPTIONS.map((option) => [option.value, option]),
);

const renderRegionalFormatOption: SelectProps["renderOption"] = ({
  option,
}) => {
  const localeOption = userLocaleOptionByValue.get(option.value as UserLocale);

  return (
    <Stack gap={0}>
      <Text size="sm">{option.label}</Text>
      {localeOption ? (
        <Text size="xs" c="dimmed">
          {localeOption.sample}
        </Text>
      ) : null}
    </Stack>
  );
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
  returnTarget: UserSettingsReturnTarget | null;
  settings: UserSettingsPageData;
  onSubmit: (values: UserSettingsFormValues) => Promise<void>;
}) {
  const { returnTarget, settings } = args;
  const { isSubmitting, runSubmit } = useDialogSubmitState();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const form = useForm<UserSettingsFormValues>({
    mode: "controlled",
    initialValues: {
      name: settings.name,
      avatarUrl: settings.avatarUrl,
      locale: settings.locale,
    },
    validate: {
      name: (value) =>
        value.trim().length > 128
          ? "Name cannot be longer than 128 characters."
          : null,
      avatarUrl: validateAvatarUrl,
      locale: (value) =>
        isSupportedUserLocale(value)
          ? null
          : "Regional format must be a supported option.",
    },
  });

  useEffect(() => {
    form.setValues({
      name: settings.name,
      avatarUrl: settings.avatarUrl,
      locale: settings.locale,
    });
    form.resetDirty();
    setSubmitError(null);
    // Mantine's form object is intentionally omitted to reset only when loader data changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings]);

  const avatarUrl = form.values.avatarUrl.trim();
  const selectedLocale = resolveSupportedUserLocale(form.values.locale);
  const selectedLocaleOption = selectedLocale
    ? userLocaleOptionByValue.get(selectedLocale)
    : null;

  return (
    <NarrowPageShell py="xl">
      <TopPageHeader
        heading={<Title order={2}>User Settings</Title>}
        actions={
          returnTarget ? (
            <LinkButton
              leftSection={<IconArrowLeft size={16} />}
              to={returnTarget.href}
              variant="default"
            >
              {returnTarget.label}
            </LinkButton>
          ) : null
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
                locale: values.locale,
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
                Name and avatar are stored in Logto. Regional format is stored
                in Cashfolio.
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

          <Select
            label="Regional Format"
            description={
              selectedLocaleOption
                ? `Example: ${selectedLocaleOption.sample}`
                : "Choose how dates and numbers are formatted."
            }
            withAsterisk
            allowDeselect={false}
            disabled={isSubmitting}
            searchable
            nothingFoundMessage="No regional format found"
            data={USER_LOCALE_OPTION_GROUPS}
            renderOption={renderRegionalFormatOption}
            {...form.getInputProps("locale")}
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
    </NarrowPageShell>
  );
}
