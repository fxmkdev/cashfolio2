import type { Meta, StoryObj } from "@storybook/react-vite";
import { Text } from "@mantine/core";
import { useRouterState } from "@tanstack/react-router";
import {
  expect,
  fireEvent,
  fn,
  screen,
  userEvent,
  waitFor,
  within,
} from "storybook/test";
import type { UserLocale } from "@/user-locale";
import {
  NewAccountBookPageActions,
  resolveNewAccountBookReturnTarget,
} from "./-new-account-book-page-actions";
import { NewAccountBookPageView } from "./-new-account-book-page-view";
import {
  useNewAccountBookForm,
  type NewAccountBookSubmission,
} from "./-use-new-account-book-form";

const accountBooks = [{ id: "storybook-book", name: "Storybook Book" }];
const userProfile = {
  displayName: "Storybook User",
  avatarUrl: null,
  initials: "SU",
};

function NewAccountBookStory({
  onSubmit,
  returnTo,
  userLocale = "en-US",
  routeSmoke = false,
}: {
  onSubmit: (values: NewAccountBookSubmission) => Promise<void>;
  returnTo?: string;
  userLocale?: UserLocale;
  routeSmoke?: boolean;
}) {
  const controller = useNewAccountBookForm(onSubmit);
  const location = useRouterState({ select: (state) => state.location });
  const searchReturnTo = new URLSearchParams(location.searchStr).get(
    "returnTo",
  );
  const returnTarget = resolveNewAccountBookReturnTarget({
    accountBooks,
    returnTo:
      returnTo ?? (routeSmoke ? (searchReturnTo ?? undefined) : undefined),
  });

  return (
    <>
      <NewAccountBookPageView
        {...controller}
        userLocale={userLocale}
        actions={
          <NewAccountBookPageActions
            returnTarget={returnTarget}
            userProfile={userProfile}
          />
        }
      />
      {routeSmoke && <Text data-testid="router-href">{location.href}</Text>}
    </>
  );
}

const meta = {
  title: "Routes/NewAccountBookPageView",
  component: NewAccountBookStory,
  parameters: { router: { initialPath: "/account-books/new" } },
  args: {
    onSubmit: fn<(values: NewAccountBookSubmission) => Promise<void>>(
      async () => undefined,
    ),
  },
  decorators: [
    (Story) => (
      <div onSubmit={(event) => event.preventDefault()}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof NewAccountBookStory>;

export default meta;
type Story = StoryObj<typeof meta>;

export const FirstBook: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByLabelText(/Account Book Name/)).toHaveValue("");
    await expect(canvas.getByLabelText(/Reference Currency/)).toHaveValue(
      "CHF – Swiss Franc",
    );
    await userEvent.click(
      canvas.getByRole("button", {
        name: "Open user menu, current: Storybook User",
      }),
    );
    const signOut = await screen.findByRole("menuitem", { name: "Sign Out" });
    await expect(signOut.closest("form")).toHaveAttribute(
      "action",
      "/api/logto/sign-out",
    );
    await expect(signOut.closest("form")).toHaveAttribute("method", "post");
    await userEvent.keyboard("{Escape}");
  },
};

export const ReturnToBook: Story = {
  args: { returnTo: "/storybook-book/report?period=2026-01#rows" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole("link", { name: "Back to Storybook Book" }),
    ).toHaveAttribute("href", "/storybook-book/report?period=2026-01#rows");
    await expect(
      canvas.queryByRole("button", { name: /Open user menu/ }),
    ).not.toBeInTheDocument();
  },
};

export const Validation: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Create" }));
    await expect(
      canvas.getByText("Account book name is required"),
    ).toBeVisible();
    await expect(args.onSubmit).not.toHaveBeenCalled();
  },
};

export const Submit: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.type(
      canvas.getByLabelText(/Account Book Name/),
      "  Household  ",
    );
    const date = canvas.getByLabelText(/Start Date/);
    await userEvent.clear(date);
    await userEvent.type(date, "01/15/2026");
    await userEvent.tab();
    await userEvent.click(canvas.getByRole("button", { name: "Create" }));
    await expect(args.onSubmit).toHaveBeenCalledTimes(1);
    await expect(args.onSubmit).toHaveBeenCalledWith({
      name: "Household",
      referenceCurrency: "CHF",
      startDate: "2026-01-15T00:00:00.000Z",
    });
  },
};

export const Pending: Story = {
  args: {
    onSubmit: fn<(values: NewAccountBookSubmission) => Promise<void>>(
      () => new Promise<void>(() => undefined),
    ),
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const name = canvas.getByLabelText(/Account Book Name/);
    await userEvent.type(name, "Household");
    const create = canvas.getByRole("button", { name: "Create" });
    await userEvent.click(create);
    await expect(create).toBeDisabled();
    await expect(name).toBeDisabled();
    await expect(canvas.getByLabelText(/Reference Currency/)).toBeDisabled();
    await expect(canvas.getByLabelText(/Start Date/)).toBeDisabled();
    const form = create.closest("form");
    if (!form) throw new Error("Missing creation form");
    fireEvent.submit(form);
    await expect(args.onSubmit).toHaveBeenCalledTimes(1);
  },
};

export const FailureAndRetry: Story = {
  play: async ({ canvasElement, args }) => {
    args.onSubmit.mockRejectedValueOnce(
      new Error("Creation is temporarily unavailable."),
    );
    const canvas = within(canvasElement);
    const name = canvas.getByLabelText(/Account Book Name/);
    await userEvent.type(name, "Household");
    const create = canvas.getByRole("button", { name: "Create" });
    await userEvent.click(create);
    await expect(
      await canvas.findByText("Creation is temporarily unavailable."),
    ).toBeVisible();
    await expect(name).toHaveValue("Household");
    await expect(create).toBeEnabled();
    await userEvent.click(create);
    await waitFor(() => expect(args.onSubmit).toHaveBeenCalledTimes(2));
    await expect(
      canvas.queryByText("Creation is temporarily unavailable."),
    ).not.toBeInTheDocument();
  },
};

export const RouteSmoke: Story = {
  args: { routeSmoke: true },
  parameters: {
    router: {
      initialPath:
        "/account-books/new?returnTo=%2Fstorybook-book%2Freport%3Fperiod%3D2026-01%23rows",
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByTestId("router-href")).toHaveTextContent(
      "/account-books/new?returnTo=",
    );
    await userEvent.click(
      canvas.getByRole("link", { name: "Back to Storybook Book" }),
    );
    await waitFor(() =>
      expect(canvas.getByTestId("router-href")).toHaveTextContent(
        "/storybook-book/report?period=2026-01#rows",
      ),
    );
  },
};
