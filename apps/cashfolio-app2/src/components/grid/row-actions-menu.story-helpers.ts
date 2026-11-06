import { expect, userEvent, waitFor, within } from "storybook/test";

export async function openRowActionsMenu(row: HTMLElement) {
  const body = within(row.ownerDocument.body);
  if (body.queryByRole("menu")) {
    await userEvent.keyboard("{Escape}");
    await waitFor(() =>
      expect(body.queryByRole("menu")).not.toBeInTheDocument(),
    );
  }
  await userEvent.hover(row);
  const trigger = within(row).getByRole("button", {
    name: /^More Actions for /,
  });
  trigger.scrollIntoView({ block: "nearest", inline: "nearest" });
  await userEvent.click(trigger);
  const menu = await body.findByRole("menu");
  await waitFor(() => expect(menu).toBeVisible());
  return within(menu);
}
