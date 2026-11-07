import { useTransactionWorkflow } from "./use-transaction-workflow";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button, Text } from "@mantine/core";
import { expect, fn, screen, userEvent, waitFor, within } from "storybook/test";
import type { SimpleTransactionDraftValues } from "@/components/transactions/simple-transaction-modal";
import { LedgerTransactionCreateDialogs } from "./transaction-create-dialogs";
import { LedgerTransactionEditDialog } from "./transaction-edit-dialog";
import {
  createLedgerStoryAccount,
  getLedgerStoryViewData,
} from "./page-view.story-fixtures";
import {
  useLedgerStoryCreateDialogs,
  useLedgerStoryEditDialog,
} from "./page-view.story-dialogs";

type CompletionMock = ReturnType<typeof fn<(complete: () => void) => void>>;
type LifecycleProps = {
  pending?: boolean;
  onClose?: () => void;
  onExit?: () => void;
  onDraft?: (draft: SimpleTransactionDraftValues) => void;
  onLifecycle?: (event: string) => void;
  registerCompletion?: CompletionMock;
};

function CreateDialogHarness(props: LifecycleProps) {
  const state = useLedgerStoryCreateDialogs({ startWithSimpleModal: true });
  const data = getLedgerStoryViewData(createLedgerStoryAccount({}), {});
  return (
    <LedgerTransactionCreateDialogs
      {...data}
      {...state.props}
      onCloseSimpleModal={() => {
        props.onClose?.();
        state.props.onCloseSimpleModal();
      }}
      onSimpleModalExitTransitionEnd={props.onExit ?? (() => undefined)}
      onSwitchCreateToSplit={(draft) => {
        props.onDraft?.(draft);
        state.props.onSwitchCreateToSplit();
      }}
      onSubmitCreateSimpleTransaction={async () => {
        if (props.pending)
          await new Promise<void>((resolve) =>
            props.registerCompletion?.(resolve),
          );
        await state.props.onSubmitCreateSimpleTransaction();
      }}
    />
  );
}

function EditDialogHarness(props: LifecycleProps) {
  const state = useLedgerStoryEditDialog({ startWithEditModal: true });
  const data = getLedgerStoryViewData(createLedgerStoryAccount({}), {});
  return (
    <>
      <LedgerTransactionEditDialog
        {...data}
        {...state.props}
        onCloseEditModal={() => {
          props.onClose?.();
          props.onLifecycle?.(
            `close:${state.props.editingTransactionData?.id}`,
          );
          state.props.onCloseEditModal();
        }}
        onEditModalExitTransitionEnd={() => {
          props.onLifecycle?.(`exit:${state.props.editingTransactionData?.id}`);
          state.props.onEditModalExitTransitionEnd();
          props.onExit?.();
        }}
        onSubmitUpdateTransaction={async () => {
          if (props.pending)
            await new Promise<void>((resolve) =>
              props.registerCompletion?.(resolve),
            );
          await state.props.onSubmitUpdateTransaction();
        }}
      />
      <Text data-testid="edit-draft">
        {state.props.editingTransactionData?.id ?? "empty"}
      </Text>
    </>
  );
}

const meta: Meta<typeof CreateDialogHarness> = {
  title: "Routes/LedgerDialogLifecycle",
  component: CreateDialogHarness,
  args: {
    onClose: fn(),
    onExit: fn(),
    onDraft: fn(),
    onLifecycle: fn(),
    registerCompletion: fn(),
  },
};
export default meta;
type Story = StoryObj<typeof meta>;

async function enterDraft(dialog: HTMLElement) {
  const form = within(dialog);
  await userEvent.type(
    form.getByRole("textbox", { name: "Description" }),
    "Preserved draft",
  );
  await userEvent.type(form.getByRole("textbox", { name: "Amount" }), "42.50");
  await userEvent.click(form.getByLabelText("Account or Category"));
  await userEvent.click(await screen.findByText("Credit Card (CHF)"));
}

export const PendingCreationCannotBeDismissed: Story = {
  args: { pending: true },
  play: async ({ args }) => {
    const dialog = await screen.findByRole("dialog", {
      name: "Add Transaction",
    });
    await waitFor(() => expect(dialog).toBeVisible());
    await enterDraft(dialog);
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Create" }),
    );
    await waitFor(() =>
      expect(args.registerCompletion).toHaveBeenCalledTimes(1),
    );
    await userEvent.keyboard("{Escape}");
    await userEvent.click(
      dialog.ownerDocument.querySelector(".mantine-Modal-overlay")!,
    );
    await expect(
      within(dialog).getByRole("button", { name: "Cancel" }),
    ).toBeDisabled();
    await expect(args.onClose).not.toHaveBeenCalled();
    await expect(args.onExit).not.toHaveBeenCalled();
    await expect(dialog).toBeVisible();
    args.registerCompletion!.mock.calls[0][0]();
    await waitFor(() => expect(args.onExit).toHaveBeenCalledTimes(1));
    await expect(
      screen.queryByRole("dialog", { name: "Add Transaction" }),
    ).not.toBeInTheDocument();
  },
};

export const SwitchingToSplitForwardsDraft: Story = {
  play: async ({ args }) => {
    const dialog = await screen.findByRole("dialog", {
      name: "Add Transaction",
    });
    await waitFor(() => expect(dialog).toBeVisible());
    await enterDraft(dialog);
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Switch to Split Editor" }),
    );
    await expect(args.onDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        description: "Preserved draft",
        amount: 42.5,
        counterAccountId: "account-credit-card",
      }),
    );
    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: "Switch to Split Editor" }),
      ).not.toBeInTheDocument(),
    );
    await expect(
      await screen.findByRole("dialog", { name: "Add Transaction" }),
    ).toBeVisible();
  },
};

export const PendingEditCannotBeDismissed: Story = {
  args: {
    pending: true,
    onClose: fn(),
    onExit: fn(),
    registerCompletion: fn(),
  },
  render: (args) => <EditDialogHarness {...args} />,
  play: async ({ args }) => {
    const dialog = await screen.findByRole("dialog", {
      name: "Edit Transaction",
    });
    await waitFor(() => expect(dialog).toBeVisible());
    await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(args.registerCompletion).toHaveBeenCalledTimes(1),
    );
    await userEvent.keyboard("{Escape}");
    await userEvent.click(
      dialog.ownerDocument.querySelector(".mantine-Modal-overlay")!,
    );
    await expect(
      within(dialog).getByRole("button", { name: "Cancel" }),
    ).toBeDisabled();
    await expect(args.onClose).not.toHaveBeenCalled();
    await expect(args.onExit).not.toHaveBeenCalled();
    await expect(dialog).toBeVisible();
    args.registerCompletion!.mock.calls[0][0]();
    await waitFor(() => expect(args.onExit).toHaveBeenCalledTimes(1));
    await expect(
      screen.queryByRole("dialog", { name: "Edit Transaction" }),
    ).not.toBeInTheDocument();
  },
};

export const EditDraftClearsAfterExit: Story = {
  render: (args) => <EditDialogHarness {...args} />,
  play: async ({ canvasElement, args }) => {
    const dialog = await screen.findByRole("dialog", {
      name: "Edit Transaction",
    });
    await waitFor(() => expect(dialog).toBeVisible());
    await expect(
      within(canvasElement).getByTestId("edit-draft"),
    ).toHaveTextContent("transaction-2");
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Cancel" }),
    );
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Edit Transaction" }),
      ).not.toBeInTheDocument(),
    );
    await waitFor(() =>
      expect(within(canvasElement).getByTestId("edit-draft")).toHaveTextContent(
        "empty",
      ),
    );
    await expect(args.onLifecycle).toHaveBeenNthCalledWith(
      1,
      "close:transaction-2",
    );
    await expect(args.onLifecycle).toHaveBeenNthCalledWith(
      2,
      "exit:transaction-2",
    );
  },
};

function WorkflowHarness() {
  const account = createLedgerStoryAccount({});
  const data = getLedgerStoryViewData(account, {});
  const workflow = useTransactionWorkflow("storybook", account.id);
  return (
    <>
      <Button onClick={() => workflow.openCreate(true)}>
        Open Transaction
      </Button>
      <LedgerTransactionCreateDialogs
        {...data}
        {...workflow.viewProps}
        onSwitchCreateToSplit={(draft) =>
          workflow.switchCreateToSplit(draft, {
            allAccountOptions: data.accountOptions,
            currentAccount: {
              id: account.id,
              unit: account.unit,
              currency: account.currency,
              cryptocurrency: account.cryptocurrency,
              symbol: account.symbol,
              tradeCurrency: account.tradeCurrency,
            },
          })
        }
        onSubmitCreateSimpleTransaction={async () => {
          throw new Error("Submission rejected");
        }}
        onSubmitCreateTransaction={async () => {
          workflow.close();
        }}
      />
    </>
  );
}

export const ReducerPreservesDraftAfterFailureAndSwitch: Story = {
  render: () => <WorkflowHarness />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      canvas.getByRole("button", { name: "Open Transaction" }),
    );
    const simple = await screen.findByRole("dialog", {
      name: "Add Transaction",
    });
    await enterDraft(simple);
    await userEvent.click(
      within(simple).getByRole("button", { name: "Create" }),
    );
    await expect(
      await within(simple).findByText("Submission rejected"),
    ).toBeVisible();
    await expect(
      within(simple).getByRole("textbox", { name: "Description" }),
    ).toHaveValue("Preserved draft");
    await userEvent.click(
      within(simple).getByRole("button", { name: "Switch to Split Editor" }),
    );
    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: "Switch to Split Editor" }),
      ).not.toBeInTheDocument(),
    );
    const split = await screen.findByRole("dialog", {
      name: "Add Transaction",
    });
    await expect(
      within(split).getByRole("textbox", { name: /^Description$/ }),
    ).toHaveValue("Preserved draft");
    await userEvent.click(
      within(split).getByRole("button", { name: "Cancel" }),
    );
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Add Transaction" }),
      ).not.toBeInTheDocument(),
    );
    await userEvent.click(
      canvas.getByRole("button", { name: "Open Transaction" }),
    );
    const reopened = await screen.findByRole("dialog", {
      name: "Add Transaction",
    });
    await expect(
      within(reopened).getByRole("textbox", { name: "Description" }),
    ).toHaveValue("");
  },
};
