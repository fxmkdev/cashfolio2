import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import { AccountsPageView } from "../-page-view";
import { createOrganizerStoryApi } from "../-organize/story-fixtures";
import { AccountsPageStoryHarness } from "./harness";

const normalPath = "/storybook-book/accounts?tab=BALANCE&mode=active";
const meta: Meta<typeof AccountsPageView> = {
  title: "Routes/AccountsPageView",
  component: AccountsPageView,
  parameters: { router: { initialPath: normalPath } },
  args: { organizerApi: createOrganizerStoryApi() },
  render: (args) => (
    <AccountsPageStoryHarness
      initialMode="active"
      organizerApi={args.organizerApi}
      organizeHistory
    />
  ),
};
export default meta;
type Story = StoryObj<typeof meta>;

export const OrganizeBackForwardAndDone: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const financialGrid = await canvas.findByRole("treegrid");
    await userEvent.click(canvas.getByRole("button", { name: "Organize" }));
    const organizer = await canvas.findByRole("region", {
      name: "Organize Accounts",
    });
    await expect(canvas.getByTestId("history-index")).toHaveTextContent("1");
    await userEvent.click(
      within(organizer).getByRole("checkbox", { name: "Show Archived" }),
    );
    await userEvent.click(canvas.getByRole("button", { name: "Browser Back" }));
    await waitFor(() => expect(organizer).not.toBeInTheDocument());
    await expect(canvas.getByRole("treegrid")).toBe(financialGrid);
    await expect(canvas.getByTestId("history-index")).toHaveTextContent("0");
    await userEvent.click(
      canvas.getByRole("button", { name: "Browser Forward" }),
    );
    const reopened = await canvas.findByRole("region", {
      name: "Organize Accounts",
    });
    await expect(
      within(reopened).getByRole("checkbox", { name: "Show Archived" }),
    ).toBeChecked();
    await expect(
      canvas.queryByRole("button", { name: "Undo" }),
    ).not.toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: "Done" }));
    await waitFor(() =>
      expect(canvas.getByTestId("history-index")).toHaveTextContent("0"),
    );
    await expect(canvas.getByTestId("history-href")).not.toHaveTextContent(
      "organize",
    );
    await expect(canvas.getByRole("treegrid")).toBe(financialGrid);
  },
};

export const DirectOrganizeEntry: Story = {
  parameters: { router: { initialPath: `${normalPath}&organize=true` } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByRole("region", { name: "Organize Accounts" });
    await expect(canvas.getByTestId("history-index")).toHaveTextContent("0");
    await userEvent.click(canvas.getByRole("button", { name: "Done" }));
    await canvas.findByRole("button", { name: "Organize" });
    await expect(canvas.getByTestId("history-index")).toHaveTextContent("0");
    await expect(canvas.getByTestId("history-href")).not.toHaveTextContent(
      "organize",
    );
  },
};

export const BackCancelsOrganizeLoading: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const api = args.organizerApi!;
    const original = api.load;
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
      await userEvent.click(canvas.getByRole("button", { name: "Organize" }));
      await waitFor(() => expect(load).toHaveBeenCalledTimes(1));
      await expect(canvas.getByTestId("history-href")).toHaveTextContent(
        "organize=true",
      );
      await userEvent.click(
        canvas.getByRole("button", { name: "Browser Back" }),
      );
      await waitFor(() =>
        expect(canvas.getByRole("button", { name: "Organize" })).toBeEnabled(),
      );
      release();
      await load.mock.results[0]!.value;
      await userEvent.hover(canvas.getByRole("heading", { name: "Accounts" }));
      await expect(
        canvas.queryByRole("region", { name: "Organize Accounts" }),
      ).not.toBeInTheDocument();
      await userEvent.click(
        canvas.getByRole("button", { name: "Browser Forward" }),
      );
      await canvas.findByRole("region", { name: "Organize Accounts" });
      await expect(load).toHaveBeenCalledTimes(2);
    } finally {
      release();
      api.load = original;
    }
  },
};

export const OrganizeRetryKeepsHistoryEntry: Story = {
  args: { organizerApi: createOrganizerStoryApi("load") },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Organize" }));
    await canvas.findByRole("alert");
    await expect(canvas.getByTestId("history-index")).toHaveTextContent("1");
    await expect(canvas.getByTestId("history-href")).toHaveTextContent(
      "organize=true",
    );
    await userEvent.click(canvas.getByRole("button", { name: "Try Again" }));
    await canvas.findByRole("region", { name: "Organize Accounts" });
    await expect(canvas.getByTestId("history-index")).toHaveTextContent("1");
    await userEvent.click(canvas.getByRole("button", { name: "Done" }));
    await waitFor(() =>
      expect(canvas.getByTestId("history-index")).toHaveTextContent("0"),
    );
  },
};

// Memory history supports blockers for push/replace. The E2E also exercises
// native browser Back while a server request is held in flight.
function pendingNavigation(
  kind: "move" | "undo" | "recovery",
): NonNullable<Story["play"]> {
  return async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    const api = args.organizerApi!;
    await userEvent.click(canvas.getByRole("button", { name: "Organize" }));
    await canvas.findByRole("region", { name: "Organize Accounts" });
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    // Preserve each API signature while deferring just the selected request.
    const move = api.move;
    const undo = api.undo;
    const load = api.load;
    const deferred = fn(async () => {
      await gate;
    });
    if (kind === "move")
      api.move = async (...args) => {
        await deferred();
        return move(...args);
      };
    if (kind === "undo")
      api.undo = async (...args) => {
        await deferred();
        return undo(...args);
      };
    if (kind === "recovery")
      api.load = async () => {
        await deferred();
        return load();
      };
    try {
      await userEvent.click(
        await canvas.findByRole("button", { name: "Move Checking" }),
      );
      const dialog = within(
        await body.findByRole("dialog", { name: "Move To…" }),
      );
      await userEvent.click(dialog.getByLabelText("Destination"));
      await userEvent.click(
        await body.findByRole("option", { name: "Long-Term" }),
      );
      await userEvent.click(dialog.getByRole("button", { name: "Move" }));
      if (kind === "undo") {
        await waitFor(() =>
          expect(
            body.queryByRole("dialog", { name: "Move To…" }),
          ).not.toBeInTheDocument(),
        );
        await userEvent.click(
          await canvas.findByRole("button", { name: "Undo" }),
        );
      }
      await waitFor(() => expect(deferred).toHaveBeenCalledTimes(1));
      await expect(canvas.getByRole("button", { name: "Done" })).toBeDisabled();
      // A programmatic click represents navigation outside the modal focus trap.
      canvas.getByRole("button", { name: "Navigate to Accounts" }).click();
      await userEvent.hover(canvas.getByRole("heading", { name: "Accounts" }));
      await expect(canvas.getByTestId("history-index")).toHaveTextContent("1");
      await expect(
        canvas.getByRole("region", { name: "Organize Accounts" }),
      ).toBeVisible();
      release();
      await canvas.findByRole("button", { name: "Organize" });
      await expect(
        canvas.queryByRole("region", { name: "Organize Accounts" }),
      ).not.toBeInTheDocument();
      await expect(canvas.getByTestId("history-index")).toHaveTextContent("2");
      await expect(deferred).toHaveBeenCalledTimes(1);
    } finally {
      release();
      // The three saved functions retain their exact signatures.
      api.move = move;
      api.undo = undo;
      api.load = load;
    }
  };
}

export const OrganizeNavigationWaitsForMove: Story = {
  args: { organizerApi: createOrganizerStoryApi() },
  play: pendingNavigation("move"),
};
export const OrganizeNavigationWaitsForUndo: Story = {
  args: { organizerApi: createOrganizerStoryApi() },
  play: pendingNavigation("undo"),
};
export const OrganizeNavigationWaitsForRecovery: Story = {
  args: { organizerApi: createOrganizerStoryApi("network") },
  play: pendingNavigation("recovery"),
};

export const DirectOrganizeAssetClassIsExcluded: Story = {
  parameters: {
    router: { initialPath: `${normalPath}&grouping=assetClass&organize=true` },
  },
  render: (args) => (
    <AccountsPageStoryHarness
      initialMode="active"
      initialGrouping="assetClass"
      organizerApi={args.organizerApi}
      organizeHistory
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await waitFor(() =>
      expect(canvas.getByTestId("history-href")).not.toHaveTextContent(
        "organize",
      ),
    );
    await expect(canvas.getByTestId("history-index")).toHaveTextContent("0");
    await expect(
      canvas.queryByRole("region", { name: "Organize Accounts" }),
    ).not.toBeInTheDocument();
    await expect(
      canvas.queryByRole("button", { name: "Organize" }),
    ).not.toBeInTheDocument();
  },
};
