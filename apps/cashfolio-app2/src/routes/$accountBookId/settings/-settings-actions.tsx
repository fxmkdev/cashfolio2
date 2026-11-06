import { Button, Menu } from "@mantine/core";
import { IconDots, IconTrash } from "@tabler/icons-react";
import { useRef, useState } from "react";
import { useHydrated } from "@/hooks/use-hydrated";
import { DeleteAccountBookModal } from "./-delete-account-book-modal";

export function SettingsActions(args: {
  accountBookName: string;
  onDelete: (values: { confirmationName: string }) => Promise<void>;
  onRefreshConstraints?: () => Promise<void>;
}) {
  const isHydrated = useHydrated();
  const [menuOpened, setMenuOpened] = useState(false);
  const [deleteModalOpened, setDeleteModalOpened] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  return (
    <>
      <Menu
        opened={menuOpened}
        onChange={setMenuOpened}
        position="bottom-end"
        withinPortal
        returnFocus={false}
        onExitTransitionEnd={() => {
          // A newly opened dialog owns focus while the menu finishes closing.
          const active = document.activeElement;
          if (
            active === document.body ||
            dropdownRef.current?.contains(active)
          ) {
            triggerRef.current?.focus({ preventScroll: true });
          }
        }}
      >
        <Menu.Target>
          <Button
            ref={triggerRef}
            variant="subtle"
            color="gray"
            size="sm"
            aria-label="More Account Book Actions"
            rightSection={<IconDots size={16} aria-hidden="true" />}
            disabled={!isHydrated || isSubmitting}
          >
            More
          </Button>
        </Menu.Target>
        <Menu.Dropdown ref={dropdownRef}>
          <Menu.Item
            color="red"
            leftSection={<IconTrash size={16} aria-hidden="true" />}
            onClick={() => {
              triggerRef.current?.focus({ preventScroll: true });
              setDeleteModalOpened(true);
            }}
          >
            Delete Account Book…
          </Menu.Item>
        </Menu.Dropdown>
      </Menu>
      <DeleteAccountBookModal
        opened={deleteModalOpened}
        accountBookName={args.accountBookName}
        onClose={() => setDeleteModalOpened(false)}
        onConfirm={args.onDelete}
        onRefreshConstraints={args.onRefreshConstraints}
        onSubmittingChange={setIsSubmitting}
      />
    </>
  );
}
