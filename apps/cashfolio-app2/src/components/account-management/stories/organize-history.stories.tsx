import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import { AccountsPageView } from "../page-view";
import { createOrganizerStoryApi } from "@/components/hierarchy-organize/story-fixtures";
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
    ).not.toBeChecked();

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
  render: (args) => (
    <AccountsPageStoryHarness
      initialMode="active"
      organizerApi={args.organizerApi}
      organizeHistory
      bulkAssignment
      expandGroups
    />
  ),
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    // A cancelled later entry must not restore an earlier session's grid state.
    await userEvent.click(canvas.getByRole("button", { name: "Organize" }));
    await canvas.findByRole("region", { name: "Organize Accounts" });
    await userEvent.click(canvas.getByRole("button", { name: "Done" }));
    await waitFor(() =>
      expect(
        canvas.queryByRole("region", { name: "Organize Accounts" }),
      ).not.toBeInTheDocument(),
    );
    const financialGrid = await canvas.findByRole("treegrid");
    await waitFor(() =>
      expect(
        within(financialGrid).getByText("Wallet", { exact: true }),
      ).toBeVisible(),
    );
    await userEvent.click(
      canvas.getByRole("button", { name: "Filter to Checking" }),
    );
    await waitFor(() =>
      expect(
        within(financialGrid).queryByText("Wallet", { exact: true }),
      ).not.toBeInTheDocument(),
    );
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
      await new Promise(requestAnimationFrame);
      await expect(
        within(financialGrid).queryByText("Wallet", { exact: true }),
      ).not.toBeInTheDocument();
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
  kind: "move" | "archive" | "recovery",
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
    const archive = api.archive;
    const load = api.load;
    const deferred = fn(async () => {
      await gate;
    });
    if (kind === "move")
      api.move = async (...args) => {
        await deferred();
        return move(...args);
      };
    if (kind === "archive")
      api.archive = async (...args) => {
        await deferred();
        if (!archive) throw new Error("Archive is required by this story.");
        return archive(...args);
      };
    if (kind === "recovery")
      api.load = async () => {
        await deferred();
        return load();
      };
    try {
      if (kind === "archive") {
        await userEvent.click(
          await canvas.findByRole("button", { name: "Archive Checking" }),
        );
        const dialog = within(
          await body.findByRole("dialog", { name: "Archive Account" }),
        );
        await userEvent.click(dialog.getByRole("button", { name: "Archive" }));
      } else {
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
      api.archive = archive;
      api.load = load;
    }
  };
}

export const OrganizeNavigationWaitsForMove: Story = {
  args: { organizerApi: createOrganizerStoryApi() },
  play: pendingNavigation("move"),
};
export const OrganizeNavigationWaitsForArchive: Story = {
  args: { organizerApi: createOrganizerStoryApi() },
  play: pendingNavigation("archive"),
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
