import { useState } from "react";
import { Alert, Box, Button } from "@mantine/core";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import { AccountOrganizer } from "./organizer";
import { createOrganizerStoryApi } from "./story-fixtures";
import { useOrganizer, type OrganizerApi } from "./use-organizer";
import { OrganizerActions } from "./organizer-actions";
import { useGlobalLoading } from "@/components/navigation/global-loading";

export function Harness({
  failure,
  useProvidedApi = false,
  ...props
}: {
  accountBookId: string;
  api: OrganizerApi;
  onSaved: () => void;
  onDone: () => void;
  useProvidedApi?: boolean;
  failure?: "busy" | "network" | "load";
}) {
  const [api] = useState(() =>
    useProvidedApi ? props.api : createOrganizerStoryApi(failure),
  );
  const organizer = useOrganizer(props.onSaved, api);
  useGlobalLoading(organizer.loading || organizer.submitState.isRefreshing);
  return (
    <Box h={650} style={{ display: "flex", flexDirection: "column" }}>
      <OrganizerActions organizer={organizer} onDone={props.onDone} />
      {organizer.loadError && (
        <Alert role="alert">
          {organizer.loadError}
          <Button onClick={() => void organizer.load()}>Refresh Choices</Button>
        </Alert>
      )}
      {organizer.snapshot && (
        <AccountOrganizer
          accountBookId={props.accountBookId}
          organizer={organizer}
        />
      )}
    </Box>
  );
}

export async function row(canvasElement: HTMLElement, id: string) {
  let found: HTMLElement | null = null;
  await waitFor(() => {
    found = canvasElement.querySelector<HTMLElement>(`.ag-row[row-id="${id}"]`);
    expect(found).not.toBeNull();
    expect(found).toBeVisible();
    expect(found!.querySelector(".ag-group-value")).not.toBeNull();
  });
  return found!;
}
export async function select(canvasElement: HTMLElement, id: string) {
  const element = await row(canvasElement, id);
  const checkbox = element.querySelector<HTMLElement>(
    ".ag-selection-checkbox input",
  )!;
  await userEvent.click(checkbox);
}
export async function chooseMove(
  canvasElement: HTMLElement,
  destination = "Long-Term",
) {
  const canvas = within(canvasElement);
  const body = within(canvasElement.ownerDocument.body);
  await userEvent.click(
    within(
      canvas.getByRole("toolbar", { name: "Organize Account Actions" }),
    ).getByRole("button", {
      name: "Move To…",
    }),
  );
  const dialogElement = await body.findByRole("dialog", { name: "Move To…" });
  await waitFor(() => expect(dialogElement).toBeVisible());
  const dialog = within(dialogElement);
  await userEvent.click(dialog.getByLabelText("Destination"));
  const option = (await body.findAllByRole("option")).find((item) =>
    within(item).queryByText(destination, { exact: true }),
  );
  if (!option) throw new Error(`Missing destination ${destination}`);
  await userEvent.click(within(option).getByText(destination, { exact: true }));
  return dialog;
}

export const organizerStoryMeta = {
  title: "Routes/Accounts/Organize",
  component: Harness,
  args: {
    accountBookId: "story-book",
    onDone: fn(),
    onSaved: fn(),
    api: createOrganizerStoryApi(),
  },
  render: (args) => <Harness {...args} />,
} satisfies Meta<typeof Harness>;
export type OrganizerStory = StoryObj<typeof organizerStoryMeta>;
