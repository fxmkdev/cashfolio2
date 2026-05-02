import { getAccountBookSettings } from "@/server/account-books";
import { normalizeDateInputValue, startOfUtcDay } from "@/shared/date";

export async function loadAccountBookSettingsPageData(args: {
  accountBookId: string;
}) {
  const settings = await getAccountBookSettings({
    data: { accountBookId: args.accountBookId },
  });

  const startDate = normalizeDateInputValue(settings.startDate);
  if (!startDate) {
    throw new Error("Invalid account book start date payload.");
  }

  return {
    ...settings,
    startDate: startOfUtcDay(startDate),
  };
}
