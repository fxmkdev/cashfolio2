import { getAccountBookSettings } from "@/server/account-books";

export async function loadAccountBookSettingsPageData(args: {
  accountBookId: string;
}) {
  return getAccountBookSettings({
    data: { accountBookId: args.accountBookId },
  });
}
