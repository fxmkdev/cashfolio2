import { Link } from "~/platform/link";
import {
  NavSidebarItem,
  Sidebar,
  SidebarBody,
  SidebarFooter,
  SidebarHeader,
  SidebarItem,
  SidebarLabel,
  SidebarSection,
} from "~/platform/sidebar";
import { Avatar } from "~/platform/avatar";
import {
  Dropdown,
  DropdownButton,
  DropdownDivider,
  DropdownItem,
  DropdownLabel,
  DropdownMenu,
} from "~/platform/dropdown";
import {
  ArrowRightStartOnRectangleIcon,
  ChevronUpIcon,
  Cog8ToothIcon,
} from "~/platform/icons/standard";
import {
  ArrowsRightLeftIcon,
  ChartBarIcon,
  ScaleIcon,
  WalletIcon,
} from "~/platform/icons/navigation";
import { useRouteLoaderData } from "react-router";
import { Logo } from "~/components/logo";
import type { loader as accountBookLoader } from "~/account-books/route";

export function Navbar() {
  const accountBookLoaderData = useRouteLoaderData<typeof accountBookLoader>(
    "account-books/route",
  );
  if (!accountBookLoaderData) {
    throw new Error("No account book loader data");
  }
  const { userClaims, accountBook } = accountBookLoaderData;

  return (
    <Sidebar>
      <SidebarHeader>
        <Link
          className="mt-1 flex items-center gap-4"
          href="/"
          aria-label="Home"
        >
          <Logo className="w-8" />
          <SidebarLabel className="text-sm font-semibold uppercase tracking-widest">
            Cashfolio
          </SidebarLabel>
        </Link>
      </SidebarHeader>
      <SidebarBody>
        <SidebarSection>
          <NavSidebarItem href={`/${accountBook.id}/balances`}>
            <ScaleIcon />
            <SidebarLabel>Balances</SidebarLabel>
          </NavSidebarItem>
          <NavSidebarItem href={`/${accountBook.id}/income`}>
            <ChartBarIcon />
            <SidebarLabel>Income</SidebarLabel>
          </NavSidebarItem>
          <NavSidebarItem href={`/${accountBook.id}/income/sankey`}>
            <ArrowsRightLeftIcon />
            <SidebarLabel>Income Sankey</SidebarLabel>
          </NavSidebarItem>
          <NavSidebarItem href={`/${accountBook.id}/accounts`}>
            <WalletIcon />
            <SidebarLabel>Accounts</SidebarLabel>
          </NavSidebarItem>
        </SidebarSection>
      </SidebarBody>
      <SidebarFooter>
        <Dropdown>
          <DropdownButton as={SidebarItem}>
            <span className="flex min-w-0 items-center gap-3">
              <Avatar
                src={userClaims.picture}
                className="size-10"
                square
                alt=""
              />
              <span className="min-w-0">
                <span className="block truncate text-sm/5 font-medium text-neutral-950 dark:text-white">
                  {userClaims.name}
                </span>
                <span className="block truncate text-xs/5 font-normal text-neutral-500 dark:text-neutral-400">
                  {userClaims.email}
                </span>
              </span>
            </span>
            <ChevronUpIcon />
          </DropdownButton>
          <DropdownMenu className="min-w-64" anchor="top start">
            <DropdownItem href={`/${accountBook.id}/settings`}>
              <Cog8ToothIcon />
              <DropdownLabel>Settings</DropdownLabel>
            </DropdownItem>
            <DropdownDivider />
            <DropdownItem href="/api/logto/sign-out">
              <ArrowRightStartOnRectangleIcon />
              <DropdownLabel>Sign out</DropdownLabel>
            </DropdownItem>
          </DropdownMenu>
        </Dropdown>
      </SidebarFooter>
    </Sidebar>
  );
}
