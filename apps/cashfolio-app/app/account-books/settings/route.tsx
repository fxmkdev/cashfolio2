import { Divider } from "~/platform/divider";
import { Input } from "~/platform/forms/input";
import { Heading, Subheading } from "~/platform/heading";
import { Text } from "~/platform/text";
import { useAccountBook } from "../hooks";
import { CurrencyCombobox } from "~/components/currency-combobox";
import { Button } from "~/platform/button";
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
import { Field, FieldGroup, Label } from "~/platform/forms/fieldset";
import { AccountType } from "~/.prisma-client/enums";
import { defaultShouldRevalidate } from "~/revalidation";
import { Select } from "@mantine/core";

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
    <div className="flex justify-center">
      <div className="max-w-3xl space-y-32">
        <fetcher.Form method="POST" action="/account-books/update">
          <input type="hidden" name="id" value={accountBook.id} />

          <Heading>Settings</Heading>
          <Divider className="my-10 mt-6" />

          <section className="grid gap-x-8 gap-y-6 sm:grid-cols-2">
            <div className="space-y-1">
              <Subheading>Account Book Name</Subheading>
            </div>
            <div>
              <Input
                aria-label="Account Book Name"
                name="name"
                defaultValue={accountBook.name}
              />
            </div>
          </section>

          <Divider className="my-10" soft />

          <section className="grid gap-x-8 gap-y-6 sm:grid-cols-2">
            <div className="space-y-1">
              <Subheading>Reference Currency</Subheading>
              <Text>
                This currency will be used to display balances and income.
              </Text>
            </div>
            <div>
              <CurrencyCombobox
                name="referenceCurrency"
                defaultValue={accountBook.referenceCurrency}
              />
            </div>
          </section>

          <Divider className="my-10" soft />

          <section className="grid gap-x-8 gap-y-6 sm:grid-cols-2">
            <div className="space-y-1">
              <Subheading>Account Groups for Holding Gain/Loss</Subheading>
              <Text>
                Customize under which account groups the holding gains and
                losses of your securities, cryptocurrencies, and foreign
                exchange are tracked.
              </Text>
            </div>
            <div>
              <FieldGroup>
                <Field>
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
                </Field>
                <Field>
                  <Select
                    label="Cryptocurrencies"
                    searchable
                    name="cryptoHoldingGainLossAccountGroupId"
                    data={accountGroups.map((g) => ({
                      value: g.id,
                      label: g.path,
                    }))}
                    defaultValue={
                      accountBook.cryptoHoldingGainLossAccountGroupId ??
                      undefined
                    }
                  />
                </Field>
                <Field>
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
                </Field>
              </FieldGroup>
            </div>
          </section>

          <Divider className="my-10" soft />

          <div className="flex justify-end gap-4">
            <Button type="reset" hierarchy="tertiary">
              Reset
            </Button>
            <Button type="submit">Save changes</Button>
          </div>
        </fetcher.Form>
        <div>
          <Heading>Danger Zone</Heading>
          <Divider className="my-10 mt-6" />

          <section className="grid gap-x-8 gap-y-6 sm:grid-cols-2">
            <div className="space-y-1">
              <Subheading>Delete Account Book</Subheading>
              <Text>
                This will delete the account book and all its data. This action
                cannot be undone.
              </Text>
            </div>
            <div>
              <Button
                type="button"
                hierarchy="primary"
                variant="destructive"
                onClick={() => onDeleteAccountBook(accountBook.id)}
              >
                Delete Account Book
              </Button>
            </div>
          </section>
        </div>
        <DeleteAccountBook {...deleteAccountBookProps} />
      </div>
    </div>
  );
}
