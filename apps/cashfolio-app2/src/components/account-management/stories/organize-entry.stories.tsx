import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import { createOrganizerStoryApi } from "@/components/hierarchy-organize/story-fixtures";
import { openRowActionsMenu } from "@/components/grid/row-actions-menu.story-helpers";
import { AccountsPageView } from "../page-view";
import { AccountsPageStoryHarness } from "./harness";
import { expandAssignmentGroup } from "./interaction-helpers";
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

function gate() {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}

function entryStory({
  edit = false,
  failSave = false,
  failEntryRefresh = false,
}: {
  edit?: boolean;
  failSave?: boolean;
  failEntryRefresh?: boolean;
} = {}): Story {
  const api = createOrganizerStoryApi(undefined, organizeAccountNodes());
  const initial = gate(),
    submission = gate(),
    recovery = gate();
  const read = api.load;
  let reads = 0;
  const load = fn(async () => {
    const snapshot = await read();
    if (++reads === 1) await initial.promise;
    else if (reads === 2 && failEntryRefresh) throw new Error("Offline");
    return snapshot;
  });
  api.load = load;
  let saveFailed = false;
  const save = fn(async (name: string) => {
    await submission.promise;
    if (failSave) {
      saveFailed = true;
      throw new Error("Save rejected");
    }
    if (edit) api.rename("account-checking", name);
    else
      api.create({
        id: "entry-created-group",
        nodeType: "accountGroup",
        name,
        parentId: null,
        sortOrder: 10,
        isActive: true,
        isCashAccount: false,
        unit: null,
      });
  });
  // Initial and fresh hierarchy reads also refresh editor metadata. Only the
  // normal editor's failed-submit recovery waits on the explicit recovery gate.
  const refresh = fn(async () => {
    if (saveFailed) await recovery.promise;
  });
  return {
    render: () => (
      <AccountsPageStoryHarness
        initialMode="active"
        organizerApi={api}
        expandGroups
        refreshConstraints={refresh}
        submitCreateGroup={(values) => save(values.name!)}
        submitUpdateAccount={(values) => save(values.name!)}
      />
    ),
    play: async ({ canvasElement }) => {
      const canvas = within(canvasElement);
      const body = within(canvasElement.ownerDocument.body);
      try {
        await userEvent.click(canvas.getByRole("button", { name: "Organize" }));
        await waitFor(() => expect(load).toHaveBeenCalledOnce());
        if (edit) {
          const row = (
            await canvas.findByText("Checking", { exact: true })
          ).closest<HTMLElement>(".ag-row")!;
          const menu = await openRowActionsMenu(row);
          await userEvent.click(menu.getByRole("menuitem", { name: "Edit" }));
        } else {
          await userEvent.click(
            canvas.getByRole("button", { name: "Add Group" }),
          );
        }
        const modal = await body.findByRole("dialog", {
          name: edit ? "Edit Account" : "New Group",
        });
        const dialog = within(modal);
        const name = dialog.getByRole("textbox", { name: /^Name/ });
        await userEvent.clear(name);
        await userEvent.type(name, "Saved During Organize Entry");
        const submit = dialog.getByRole("button", {
          name: edit ? "Save" : "Create",
        });
        await userEvent.click(submit);
        await waitFor(() => expect(save).toHaveBeenCalledOnce());
        initial.release();
        await load.mock.results[0]!.value;
        await new Promise(requestAnimationFrame);
        await expect(
          canvas.queryByRole("region", { name: "Organize Accounts" }),
        ).not.toBeInTheDocument();
        await expect(dialog.getByRole("textbox", { name: /^Name/ })).toBe(name);
        await expect(submit).toBeDisabled();
        await expect(
          dialog.getByRole("button", { name: "Cancel" }),
        ).toBeDisabled();
        // Even a form submission that bypasses the disabled button uses the
        // original controller's synchronous lock.
        modal
          .querySelector("form")!
          .dispatchEvent(
            new Event("submit", { bubbles: true, cancelable: true }),
          );
        await new Promise(requestAnimationFrame);
        await expect(save).toHaveBeenCalledOnce();
        submission.release();
        if (failSave) {
          await dialog.findByText("Save rejected", { exact: true });
          await waitFor(() => expect(refresh).toHaveBeenCalledTimes(2));
          await expect(submit).toBeDisabled();
          await expect(
            dialog.getByRole("button", { name: "Cancel" }),
          ).toBeDisabled();
          recovery.release();
          await waitFor(() => expect(submit).toBeEnabled());
          await expect(name).toHaveValue("Saved During Organize Entry");
          await expect(dialog.getByRole("alert")).toHaveTextContent(
            "Save rejected",
          );
          await expect(
            canvas.queryByRole("region", { name: "Organize Accounts" }),
          ).not.toBeInTheDocument();
          await expect(load).toHaveBeenCalledOnce();
          await userEvent.click(dialog.getByRole("button", { name: "Cancel" }));
        } else {
          await waitFor(() => expect(modal).not.toBeInTheDocument());
        }
        if (failEntryRefresh) {
          await expect(await canvas.findByRole("alert")).toHaveTextContent(
            "Could not load the hierarchy.",
          );
          await expect(
            canvas.queryByRole("region", { name: "Organize Accounts" }),
          ).not.toBeInTheDocument();
          await userEvent.click(
            canvas.getByRole("button", { name: "Try Again" }),
          );
        }
        const region = await canvas.findByRole("region", {
          name: "Organize Accounts",
        });
        if (edit || failSave) await expandAssignmentGroup(region, "group-cash");
        await waitFor(() =>
          expect(
            within(region).getByText(
              failSave ? "Checking" : "Saved During Organize Entry",
              { exact: true },
            ),
          ).toBeVisible(),
        );
        await expect(save).toHaveBeenCalledOnce();
        await expect(load).toHaveBeenCalledTimes(failEntryRefresh ? 3 : 2);
      } finally {
        initial.release();
        submission.release();
        recovery.release();
      }
    },
  };
}

export const OrganizeEntryWaitsForCreation = entryStory();
export const OrganizeEntryWaitsForEdit = entryStory({ edit: true });
export const OrganizeEntryPreservesFailedEditor = entryStory({
  edit: true,
  failSave: true,
});
export const OrganizeEntryRefreshDoesNotReplayCreation = entryStory({
  failEntryRefresh: true,
});
