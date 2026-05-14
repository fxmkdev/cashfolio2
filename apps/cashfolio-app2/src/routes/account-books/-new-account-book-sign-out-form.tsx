import { Button } from "@mantine/core";
import { IconLogout2 } from "@tabler/icons-react";

export function NewAccountBookSignOutForm() {
  return (
    <form action="/api/logto/sign-out" method="post">
      <Button
        type="submit"
        variant="default"
        leftSection={<IconLogout2 size={16} />}
      >
        Sign out
      </Button>
    </form>
  );
}
