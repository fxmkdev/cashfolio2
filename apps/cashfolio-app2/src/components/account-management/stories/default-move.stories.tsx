import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import { createOrganizerStoryApi } from "@/components/hierarchy-organize/story-fixtures";
import { AccountsPageView } from "../view";
import { AccountsPageStoryHarness } from "./harness";
import { openRowActionsMenu } from "@/components/grid/row-actions-menu.story-helpers";
import { organizeAccountNodes } from "./organize-action-fixtures";

const meta: Meta<typeof AccountsPageView> = {
  title: "Routes/AccountsPageView",
  component: AccountsPageView,
  parameters: {
    router: { initialPath: "/storybook-book/accounts?tab=BALANCE&mode=active" },
  },
};
export default meta;
type Story = StoryObj<typeof meta>;

function rowMoveStory(archived: boolean, assetClass: boolean): Story {
  return {
    args: {
      organizerApi: createOrganizerStoryApi(
        undefined,
        organizeAccountNodes(archived),
      ),
    },
    render: (args) => (
      <AccountsPageStoryHarness
        initialMode={archived ? "archived" : "active"}
        organizerApi={args.organizerApi}
        initialGrouping={assetClass ? "assetClass" : "accountStructure"}
        expandGroups
        bulkAssignment
        routeSmoke
      />
    ),
    play: async ({ canvasElement, args }) => {
      const canvas = within(canvasElement),
        body = within(canvasElement.ownerDocument.body);
      const move = fn(args.organizerApi!.move);
      args.organizerApi!.move = move;
      const row = (
        await canvas.findByText("Checking", { exact: true })
      ).closest<HTMLElement>(".ag-row")!;
      const menu = await openRowActionsMenu(row);
      await userEvent.click(menu.getByRole("menuitem", { name: "Move To…" }));
      const dialog = within(
        await body.findByRole("dialog", { name: "Move To…" }),
      );
      await expect(
        canvas.queryByRole("region", { name: "Organize Accounts" }),
      ).not.toBeInTheDocument();
      await expect(canvas.getByTestId("router-search")).not.toHaveTextContent(
        '"organize":true',
      );
      // Moving an archived target includes archived groups in the destination tree.
      const destination = dialog.getByLabelText("Destination");
      await userEvent.click(destination);
      await userEvent.clear(destination);
      await userEvent.type(destination, "Cash");
      await expect(body.getByRole("option", { name: /Cash/ })).toBeVisible();
      await userEvent.clear(destination);
      await userEvent.type(destination, "Top Level");
      await userEvent.click(body.getByRole("option", { name: "Top Level" }));
      await userEvent.click(dialog.getByRole("button", { name: "Move" }));
      await waitFor(() =>
        expect(body.queryByRole("dialog")).not.toBeInTheDocument(),
      );
      await expect(move).toHaveBeenCalledOnce();
      await expect(move.mock.calls[0][0].items).toEqual([
        expect.objectContaining({ id: "account-checking" }),
      ]);
      await expect(canvas.getByTestId("router-search")).not.toHaveTextContent(
        '"organize":true',
      );
      await expect(
        canvas.queryByRole("button", { name: "Move To…" }),
      ).not.toBeInTheDocument();
    },
  };
}
export const DefaultAccountMove: Story = rowMoveStory(false, false);
export const DefaultAssetClassAccountMove: Story = rowMoveStory(false, true);
export const DefaultArchivedAccountMove: Story = rowMoveStory(true, false);

export const DefaultMoveLoadingAndRetry: Story = {
  args: {
    organizerApi: createOrganizerStoryApi(undefined, organizeAccountNodes()),
  },
  render: (args) => (
    <AccountsPageStoryHarness
      initialMode="active"
      organizerApi={args.organizerApi}
      expandGroups
    />
  ),
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement),
      body = within(canvasElement.ownerDocument.body);
    const api = args.organizerApi!;
    const original = api.load;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    api.load = fn(original).mockImplementationOnce(async () => {
      await gate;
      throw new Error("Offline");
    });
    try {
      const row = (
        await canvas.findByText("Checking", { exact: true })
      ).closest<HTMLElement>(".ag-row")!;
      const menu = await openRowActionsMenu(row);
      await userEvent.click(menu.getByRole("menuitem", { name: "Move To…" }));
      const modal = await body.findByRole("dialog", { name: "Move To…" });
      const dialog = within(modal);
      await expect(
        dialog.getByRole("button", { name: "Cancel" }),
      ).toBeEnabled();
      await expect(
        dialog.queryByLabelText("Destination"),
      ).not.toBeInTheDocument();
      release();
      await expect(await dialog.findByRole("alert")).toHaveTextContent(
        "Could not load",
      );
      await userEvent.click(dialog.getByRole("button", { name: "Try Again" }));
      await expect(await dialog.findByLabelText("Destination")).toBeEnabled();
      await userEvent.click(dialog.getByRole("button", { name: "Cancel" }));
      await waitFor(() => expect(modal).not.toBeInTheDocument());
    } finally {
      release();
      api.load = original;
    }
  },
};

export const DefaultMoveCancelsPendingLoad: Story = {
  args: {
    organizerApi: createOrganizerStoryApi(undefined, organizeAccountNodes()),
  },
  render: (args) => (
    <AccountsPageStoryHarness
      initialMode="active"
      organizerApi={args.organizerApi}
      expandGroups
    />
  ),
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement),
      body = within(canvasElement.ownerDocument.body);
    const api = args.organizerApi!,
      original = api.load;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const load = fn(original).mockImplementationOnce(async () => {
      await gate;
      return original();
    });
    api.load = load;
    try {
      const row = (
        await canvas.findByText("Checking", { exact: true })
      ).closest<HTMLElement>(".ag-row")!;
      const menu = await openRowActionsMenu(row);
      await userEvent.click(menu.getByRole("menuitem", { name: "Move To…" }));
      const dialog = within(
        await body.findByRole("dialog", { name: "Move To…" }),
      );
      await userEvent.click(dialog.getByRole("button", { name: "Cancel" }));
      await waitFor(() =>
        expect(body.queryByRole("dialog")).not.toBeInTheDocument(),
      );
      release();
      await load.mock.results[0].value;
      await expect(body.queryByRole("dialog")).not.toBeInTheDocument();
      const reopenedMenu = await openRowActionsMenu(row);
      await userEvent.click(
        reopenedMenu.getByRole("menuitem", { name: "Move To…" }),
      );
      const reopened = within(
        await body.findByRole("dialog", { name: "Move To…" }),
      );
      await expect(await reopened.findByLabelText("Destination")).toBeEnabled();
      await expect(load).toHaveBeenCalledTimes(2);
      await userEvent.click(reopened.getByRole("button", { name: "Cancel" }));
    } finally {
      release();
      api.load = original;
    }
  },
};
