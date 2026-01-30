import { Link, Outlet, useMatch, type LoaderFunctionArgs } from "react-router";
import invariant from "tiny-invariant";
import { ensureAuthenticated } from "~/auth/functions.server";
import { prisma } from "~/prisma.server";
import { serialize } from "~/serialization";
import { getOrCreateUser } from "~/users/functions.server";
import {
  ensureAuthorizedForUserAndAccountBookId,
  getFirstBookingDate,
} from "./functions.server";
import { defaultShouldRevalidate } from "~/revalidation";
import {
  ActionIcon,
  AppShell,
  Box,
  Grid,
  Group,
  Tabs,
  Title,
} from "@mantine/core";
import { Logo } from "~/components/logo";
import { useAccountBook } from "./hooks";
import {
  ArrowRightStartOnRectangleIcon,
  Cog8ToothIcon,
} from "~/platform/icons/navigation";
import { LinkTab } from "~/platform/link-tab";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const userContext = await ensureAuthenticated(request);
  const user = await getOrCreateUser(userContext);
  invariant(params.accountBookId, "accountBookId is required");

  const link = await ensureAuthorizedForUserAndAccountBookId(
    user,
    params.accountBookId,
  );

  const accountBook = await prisma.accountBook.findUnique({
    where: { id: link.accountBookId },
  });
  if (!accountBook) {
    throw new Response("Not Found", { status: 404 });
  }
  if (!userContext.claims) {
    throw new Response("No user claims", { status: 500 });
  }
  return serialize({
    accountBook,
    userClaims: userContext.claims,
    firstBookingDate: await getFirstBookingDate(accountBook.id),
  });
}

export const shouldRevalidate = defaultShouldRevalidate;

export default function Route() {
  const accountBook = useAccountBook();
  const match = useMatch("/:accountBookId/:segment1?/*");

  return (
    <AppShell header={{ height: "4.5rem" }}>
      <AppShell.Header>
        <Grid p="md">
          <Grid.Col span="auto">
            <Link
              className="mt-1 flex items-center gap-4"
              to="/"
              aria-label="Home"
            >
              <Logo className="w-8" />
              <Title order={1} size="h4">
                Cashfolio
              </Title>
            </Link>
          </Grid.Col>
          <Grid.Col span={6}>
            <Group gap="xs" justify="center">
              <Tabs variant="pills" value={match?.params["segment1"] ?? ""}>
                <Tabs.List>
                  <LinkTab value="balances" to={`/${accountBook.id}/balances`}>
                    Balances
                  </LinkTab>
                  <LinkTab value="income" to={`/${accountBook.id}/income`}>
                    Income
                  </LinkTab>
                  <LinkTab value="accounts" to={`/${accountBook.id}/accounts`}>
                    Accounts
                  </LinkTab>
                </Tabs.List>
              </Tabs>
            </Group>
          </Grid.Col>
          <Grid.Col span="auto">
            <Group justify="end">
              <ActionIcon
                component="a"
                href={`/${accountBook.id}/settings`}
                variant="default"
              >
                <Cog8ToothIcon className="size-4" />
              </ActionIcon>
              <ActionIcon
                component="a"
                href="/api/logto/sign-out"
                variant="default"
              >
                <ArrowRightStartOnRectangleIcon className="size-4" />
              </ActionIcon>
            </Group>
          </Grid.Col>
        </Grid>
      </AppShell.Header>
      <AppShell.Main px="md">
        <Box mt="lg">
          <Outlet />
        </Box>
      </AppShell.Main>
    </AppShell>
  );
}
