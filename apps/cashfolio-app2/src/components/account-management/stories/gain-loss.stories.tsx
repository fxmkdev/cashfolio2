import { expect, userEvent, waitFor, within } from "storybook/test";
import { AccountType } from "@/.prisma-client/enums";
import { UserLocaleProvider } from "@/user-locale-context";
import { createGroupRow, createAccountRow } from "./fixtures";
import { openGainLossDetails } from "./interaction-helpers";
import { AccountsPageStoryHarness } from "./harness";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { AccountsPageView } from "../view";
const meta: Meta<typeof AccountsPageView> = {
  title: "Screens/Accounts/Gain and Loss/States",
  parameters: { layout: "fullscreen", controls: { disable: true } },
  component: AccountsPageView,
};
export default meta;
type Story = StoryObj<typeof meta>;
export const GainLossFailureView: Story = {
  parameters: {
    manualSetup:
      "Open Gain/Loss Details to inspect unavailable calculation dates. Close the dialog, then choose Retry to load the fixture successfully.",
  },
  render: () => (
    <AccountsPageStoryHarness initialMode="active" gainLossState="error" />
  ),
  name: "Gain Loss Failure Playground",
  tags: ["!regression"],
  play: undefined,
};

export const GainLossFailure: Story = {
  ...GainLossFailureView,
  name: "Gain Loss Failure Interaction Test",
  tags: ["regression", "!autodocs"],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    expect(canvas.queryByText("Dates unavailable")).not.toBeInTheDocument();
    const details = await openGainLossDetails(canvasElement);
    expect(details).toHaveTextContent("Dates unavailable");
    await userEvent.keyboard("{Escape}");
    await userEvent.click(canvas.getByRole("button", { name: "Retry" }));
    const readyDetails = await openGainLossDetails(canvasElement);
    expect(readyDetails).toHaveTextContent("Since 1/1/2026 · As of 3/31/2026");
    expect(canvas.queryByText("Gain/Loss Unavailable")).not.toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
  },
};

export const GainLossPartialView: Story = {
  parameters: {
    manualSetup:
      "Open Gain/Loss Details to inspect the partial valuation feedback.",
  },
  render: () => (
    <AccountsPageStoryHarness initialMode="active" gainLossState="partial" />
  ),
  name: "Gain Loss Partial Playground",
  tags: ["!regression"],
  play: undefined,
};

export const GainLossPartial: Story = {
  ...GainLossPartialView,
  name: "Gain Loss Partial Interaction Test",
  tags: ["regression", "!autodocs"],
  play: async ({ canvasElement }) => {
    const details = await openGainLossDetails(canvasElement);
    expect(details).toHaveTextContent("Since 1/1/2026 · As of 3/31/2026");
    await userEvent.keyboard("{Escape}");
  },
};

export const SignedLiabilityBalances: Story = {
  render: () => (
    <AccountsPageStoryHarness
      initialMode="active"
      initialTab="BALANCE"
      expandGroups
      rowsOverride={[
        {
          ...createGroupRow({
            id: "cards",
            name: "Credit Cards",
            type: AccountType.BALANCE,
            isActive: true,
            sortOrder: 0,
          }),
          // Group balances are computed by the controller before rendering.
          balanceInReferenceCurrency: -75,
        },
        createAccountRow({
          id: "card-debt",
          name: "Outstanding Debt",
          groupId: "cards",
          type: AccountType.BALANCE,
          isActive: true,
          sortOrder: 0,
          currency: "CHF",
          balance: -100,
          balanceInReferenceCurrency: -100,
        }),
        createAccountRow({
          id: "card-credit",
          name: "Overpaid Card",
          groupId: "cards",
          type: AccountType.BALANCE,
          isActive: true,
          sortOrder: 1,
          currency: "CHF",
          balance: 25,
          balanceInReferenceCurrency: 25,
        }),
      ]}
    />
  ),
  play: async ({ canvasElement }) => {
    await waitFor(() =>
      expect(
        canvasElement.querySelector(
          '[row-id="card-debt"] [col-id="balanceInReferenceCurrency"]',
        ),
      ).toHaveTextContent("-100.00"),
    );
    await expect(
      canvasElement.querySelector(
        '[row-id="card-credit"] [col-id="balanceInReferenceCurrency"]',
      ),
    ).toHaveTextContent("25.00");
    await expect(
      canvasElement.querySelector(
        '[row-id="cards"] [col-id="balanceInReferenceCurrency"]',
      ),
    ).toHaveTextContent("-75.00");
    await expect(
      canvasElement.querySelector(
        '.ag-row-pinned [col-id="balanceInReferenceCurrency"]',
      ),
    ).toHaveTextContent("-75.00");
  },
};

export const LocalizedLiabilityGainLossView: Story = {
  parameters: {
    docs: {
      description: {
        story:
          "The nested de-CH user locale intentionally overrides the Locale toolbar.",
      },
    },
  },
  render: () => (
    <UserLocaleProvider locale="de-CH">
      <AccountsPageStoryHarness initialMode="active" initialTab="BALANCE" />
    </UserLocaleProvider>
  ),
  name: "Localized Liability Gain Loss Playground",
  tags: ["!regression"],
  play: undefined,
};

export const LocalizedLiabilityGainLoss: Story = {
  ...LocalizedLiabilityGainLossView,
  name: "Localized Liability Gain Loss Interaction Test",
  tags: ["regression", "!autodocs"],
  play: async ({ canvasElement }) => {
    const details = await openGainLossDetails(canvasElement);
    expect(details).toHaveTextContent("Since 1.1.2026 · As of 31.3.2026");
    await userEvent.keyboard("{Escape}");
  },
};
