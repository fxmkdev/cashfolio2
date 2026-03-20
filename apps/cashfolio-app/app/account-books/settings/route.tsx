import { useAccountBook } from "../hooks";
import {
  useFetcher,
  useLoaderData,
  type LoaderFunctionArgs,
} from "react-router";
import { DeleteAccountBook, useDeleteAccountBook } from "./delete-account-book";
import type { Route } from "./+types/route";
import { getPageTitle } from "~/meta";
import { ensureAuthorized } from "../functions.server";
import { serialize } from "~/serialization";
import { getAccountGroupsWithPath } from "~/account-groups/data";
import { AccountType } from "~/.prisma-client/enums";
import { defaultShouldRevalidate } from "~/revalidation";
import {
  Container,
  Divider,
  Fieldset,
  Select,
  Button,
  Text,
  Stack,
  TextInput,
  Title,
  Group,
} from "@mantine/core";
import { currencies } from "~/currencies";

export const meta: Route.MetaFunction = () => [
  { title: getPageTitle("Settings") },
];

export async function loader({ request, params }: LoaderFunctionArgs) {
  const link = await ensureAuthorized(request, params);
  return serialize({
    accountGroups: (
      await getAccountGroupsWithPath(link.accountBookId, {
        isActive: true,
      })
    ).filter((g) => g.type === AccountType.EQUITY),
  });
}

export const shouldRevalidate = defaultShouldRevalidate;

export default function Route() {
  const { accountGroups } = useLoaderData<typeof loader>();
  const accountBook = useAccountBook();
  const fetcher = useFetcher();
  const { deleteAccountBookProps, onDeleteAccountBook } =
    useDeleteAccountBook();
  return (
    <>
      <Container size="sm" py="xl">
        <fetcher.Form method="POST" action="/account-books/update">
          <input type="hidden" name="id" value={accountBook.id} />
          <Stack gap="xl">
            <Title order={2} size="h3">
              Settings
            </Title>
            <Divider />

            <TextInput
              label="Account Book Name"
              name="name"
              defaultValue={accountBook.name}
            />

            <Select
              label="Reference Currency"
              description="This currency will be used to display balances and income."
              searchable
              name="referenceCurrency"
              defaultValue={accountBook.referenceCurrency}
              data={Object.keys(currencies)}
            />

            <Fieldset legend="Account Groups for Holding Gain/Loss">
              <Stack gap="lg">
                <Text c="dimmed" size="sm">
                  Customize under which account groups the holding gains and
                  losses of your securities, cryptocurrencies, and foreign
                  exchange are tracked.
                </Text>
                <Select
                  label="Securities"
                  searchable
                  name="securityHoldingGainLossAccountGroupId"
                  data={accountGroups.map((g) => ({
                    value: g.id,
                    label: g.path,
                  }))}
                  defaultValue={
                    accountBook.securityHoldingGainLossAccountGroupId ??
                    undefined
                  }
                />
                <Select
                  label="Cryptocurrencies"
                  searchable
                  name="cryptoHoldingGainLossAccountGroupId"
                  data={accountGroups.map((g) => ({
                    value: g.id,
                    label: g.path,
                  }))}
                  defaultValue={
                    accountBook.cryptoHoldingGainLossAccountGroupId ?? undefined
                  }
                />
                <Select
                  label="Foreign Exchange"
                  searchable
                  name="fxHoldingGainLossAccountGroupId"
                  data={accountGroups.map((g) => ({
                    value: g.id,
                    label: g.path,
                  }))}
                  defaultValue={
                    accountBook.fxHoldingGainLossAccountGroupId ?? undefined
                  }
                />
              </Stack>
            </Fieldset>

            <Group justify="end">
              <Button type="reset" variant="subtle">
                Reset
              </Button>
              <Button type="submit">Save changes</Button>
            </Group>
          </Stack>
        </fetcher.Form>
        <Stack mt="6rem" gap="xl">
          <Title order={2} size="h3">
            Danger Zone
          </Title>
          <Divider />
          <Fieldset>
            <Stack gap="lg">
              <Text c="dimmed" size="sm">
                Customize under which account groups the holding gains and
                losses of your securities, cryptocurrencies, and foreign
                exchange are tracked.
              </Text>
              <Group justify="center">
                <Button
                  type="button"
                  color="red"
                  onClick={() => onDeleteAccountBook(accountBook.id)}
                >
                  Delete Account Book
                </Button>
              </Group>
              <DeleteAccountBook {...deleteAccountBookProps} />
            </Stack>
          </Fieldset>
        </Stack>
      </Container>
    </>
  );
}
