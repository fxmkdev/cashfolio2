import { expect, waitFor } from "storybook/test";

type MenuItemQueries = {
  getAllByRole: (role: "menuitem", options: { name: string }) => HTMLElement[];
};

export async function findVisibleMenuItem(
  queries: MenuItemQueries,
  name: string,
) {
  let visibleMenuItem: HTMLElement | undefined;

  await waitFor(() => {
    visibleMenuItem = queries
      .getAllByRole("menuitem", { name })
      .find((item: HTMLElement) => {
        try {
          expect(item).toBeVisible();
          return true;
        } catch {
          return false;
        }
      });

    expect(visibleMenuItem).toBeDefined();
  });

  if (!visibleMenuItem) {
    throw new Error(`Could not find visible menu item: ${name}`);
  }

  return visibleMenuItem;
}
