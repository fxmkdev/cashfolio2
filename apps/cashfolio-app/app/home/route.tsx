import { Button, Container, Select, Stack, Text } from "@mantine/core";
import { redirect, useFetcher, type LoaderFunctionArgs } from "react-router";
import invariant from "tiny-invariant";
import { ensureAuthenticated } from "~/auth/functions.server";
import { currencies } from "~/currencies";
import { prisma } from "~/prisma.server";
import { defaultShouldRevalidate } from "~/revalidation";
import { getOrCreateUser } from "~/users/functions.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const userContext = await ensureAuthenticated(request);
  invariant(userContext.claims, "No user claims");

  const user = await getOrCreateUser(userContext);
  const links = await prisma.userAccountBookLink.findMany({
    where: { userId: user.id },
  });

  if (links.length > 0) {
    return redirect(`/${links[0].accountBookId}/accounts`);
  }
}

export const shouldRevalidate = defaultShouldRevalidate;

export default function Route() {
  const fetcher = useFetcher();
  return (
    <Container>
      <Stack gap="lg">
        <Text size="lg">There are no account books yet.</Text>

        <fetcher.Form
          method="POST"
          action="/account-books/create"
          className="contents"
        >
          <Select
            label="Reference Currency"
            name="referenceCurrency"
            data={Object.keys(currencies)}
          />
          <Button type="submit">Create Account Book</Button>
        </fetcher.Form>
      </Stack>
    </Container>
  );
}
