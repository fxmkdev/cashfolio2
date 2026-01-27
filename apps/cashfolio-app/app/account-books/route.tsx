import { Link, Outlet, type LoaderFunctionArgs } from "react-router";
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
import { ActionIcon, AppShell, Grid, Group, Stack, Title } from "@mantine/core";
import { Logo } from "~/components/logo";
import { useAccountBook } from "./hooks";
import { NavLink } from "~/platform/nav-link";
import {
  ArrowRightStartOnRectangleIcon,
  Cog8ToothIcon,
} from "~/platform/icons/navigation";

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
              <NavLink to={`/${accountBook.id}/balances`}>Balances</NavLink>
              <NavLink to={`/${accountBook.id}/income`}>Income</NavLink>
              <NavLink to={`/${accountBook.id}/accounts`}>Accounts</NavLink>
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
        <Stack py="md">
          <Outlet />
        </Stack>
      </AppShell.Main>
    </AppShell>
  );
}
