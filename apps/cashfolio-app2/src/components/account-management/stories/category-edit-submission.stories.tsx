import { Stack } from "@mantine/core";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import { createOrganizerStoryApi } from "@/components/hierarchy-organize/story-fixtures";
import { AccountsPageView } from "../page-view";
import { getRowsFor } from "./fixtures";
import { StoryControls } from "./controls";
import { useAccountsStoryModel } from "./use-story-model";
import { getStoryViewProps } from "./view-props";

const options = {
  initialMode: "active",
  initialTab: "EQUITY-EXPENSE",
  organizeHistory: true,
} as const;

function createScenario() {
  const state = {
    writeGate: undefined as Promise<void> | undefined,
    failAfterSave: false,
    failReads: false,
  };
  const api = {
    ...createOrganizerStoryApi(
      undefined,
      getRowsFor({ mode: "active", tab: "EQUITY-EXPENSE" }).map((row) => ({
        id: row.id,
        name: row.name,
        nodeType: row.nodeType,
        parentId: row.parentId ?? null,
        sortOrder: row.sortOrder,
        isActive: row.isActive,
        isCashAccount: false,
        unit: null,
      })),
    ),
    kind: "categories" as const,
  };
  const load = api.load;
  api.load = async () => {
    if (state.failReads) throw new Error("Canonical refresh unavailable");
    return load();
  };
  const save = fn(async (id: string, name: string) => {
    await state.writeGate;
    api.rename(id, name);
    state.failReads = state.failAfterSave;
  });
  return { state, api, save };
}

function CategoryEditHarness({
  scenario,
}: {
  scenario: ReturnType<typeof createScenario>;
}) {
  const model = useAccountsStoryModel(options);
  const props = getStoryViewProps(model, options);
  return (
    <Stack h={650}>
      <StoryControls model={model} options={options} />
      <AccountsPageView
        {...props}
        organizerApi={scenario.api}
        onSubmitUpdateAccount={async (values) => {
          await scenario.save(
            model.modalState.editingAccount!.id,
            values.name!,
          );
          await props.onSubmitUpdateAccount(values);
        }}
        onSubmitUpdateGroup={async (values) => {
          await scenario.save(model.modalState.editingGroup!.id, values.name!);
          await props.onSubmitUpdateGroup(values);
        }}
      />
    </Stack>
  );
}

const meta = {
  title: "Routes/Categories/Edit Submission",
  component: CategoryEditHarness,
  parameters: {
    router: {
      initialPath:
        "/storybook-book/settings/categories?tab=EQUITY-EXPENSE&showArchived=false",
    },
  },
} satisfies Meta<typeof CategoryEditHarness>;
export default meta;
type Story = StoryObj<typeof meta>;
type Target = "category" | "group";
const targetName = (target: Target) =>
  target === "category" ? "Rent" : "Housing";

async function openEditor(canvasElement: HTMLElement, target: Target) {
  const canvas = within(canvasElement);
  const body = within(canvasElement.ownerDocument.body);
  await canvas.findByRole("region", { name: "Categories Hierarchy" });
  await userEvent.click(
    await canvas.findByRole("button", { name: `Edit ${targetName(target)}` }),
  );
  const dialog = within(
    await body.findByRole("dialog", {
      name: target === "category" ? "Edit Category" : "Edit Category Group",
    }),
  );
  const name = dialog.getByRole("textbox", { name: /^Name/ });
  await userEvent.clear(name);
  await userEvent.type(name, `${targetName(target)} Updated`);
  return dialog;
}

function pendingNavigation(target: Target): NonNullable<Story["play"]> {
  return async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const dialog = await openEditor(canvasElement, target);
    let release!: () => void;
    args.scenario.state.writeGate = new Promise<void>((resolve) => {
      release = resolve;
    });
    try {
      await userEvent.click(dialog.getByRole("button", { name: "Save" }));
      await waitFor(() => expect(args.scenario.save).toHaveBeenCalledTimes(1));
      await expect(dialog.getByRole("button", { name: "Save" })).toBeDisabled();
      // Request navigation outside the modal focus trap while the write waits.
      if (target === "group")
        canvas.getByRole("tab", { name: "Income" }).click();
      else canvas.getByRole("button", { name: "Navigate to Accounts" }).click();
      await userEvent.hover(dialog.getByRole("textbox", { name: /^Name/ }));
      await expect(canvas.getByTestId("history-href")).toHaveTextContent(
        "/settings/categories?tab=EQUITY-EXPENSE",
      );
      release();
      await waitFor(() =>
        expect(canvas.getByTestId("history-href")).toHaveTextContent(
          target === "group" ? "tab=EQUITY-INCOME" : "/accounts?tab=BALANCE",
        ),
      );
      await expect(args.scenario.save).toHaveBeenCalledTimes(1);
    } finally {
      release();
    }
  };
}

function committedRefreshRecovery(target: Target): NonNullable<Story["play"]> {
  return async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    const dialog = await openEditor(canvasElement, target);
    args.scenario.state.failAfterSave = true;
    await userEvent.click(dialog.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(body.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    await canvas.findByRole("button", { name: "Refresh Choices" });
    await expect(
      canvas.getByRole("button", { name: "Add Group" }),
    ).toBeDisabled();
    await expect(
      canvas.getByRole("button", {
        name: `Move ${targetName(target)}`,
      }),
    ).toBeDisabled();
    await expect(args.scenario.save).toHaveBeenCalledTimes(1);
    args.scenario.state.failReads = false;
    await userEvent.click(
      canvas.getByRole("button", { name: "Refresh Choices" }),
    );
    await waitFor(() =>
      expect(canvas.getByRole("button", { name: "Add Group" })).toBeEnabled(),
    );
    await expect(
      await canvas.findByRole("button", {
        name: `Edit ${targetName(target)} Updated`,
      }),
    ).toBeEnabled();
    await expect(args.scenario.save).toHaveBeenCalledTimes(1);
  };
}

export const CategoryEditWaitsForNavigation: Story = {
  args: { scenario: createScenario() },
  play: pendingNavigation("category"),
};
export const GroupEditWaitsForTabChange: Story = {
  args: { scenario: createScenario() },
  play: pendingNavigation("group"),
};
export const CategoryEditRecoversCommittedSave: Story = {
  args: { scenario: createScenario() },
  play: committedRefreshRecovery("category"),
};
export const GroupEditRecoversCommittedSave: Story = {
  args: { scenario: createScenario() },
  play: committedRefreshRecovery("group"),
};
