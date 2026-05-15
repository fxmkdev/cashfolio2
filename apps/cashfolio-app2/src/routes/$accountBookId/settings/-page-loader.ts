import { getAccountBookSettings } from "@/server/account-books";
import { getActiveAccountBookUnitUsage } from "@/server/accounts";
import { normalizeDateInputValue, startOfUtcDay } from "@/shared/date";

export async function loadSettingsPageData(args: { accountBookId: string }) {
  const [settings, unitUsage] = await Promise.all([
    getAccountBookSettings({
      data: { accountBookId: args.accountBookId },
    }),
    getActiveAccountBookUnitUsage({
      data: { accountBookId: args.accountBookId },
    }),
  ]);

  const startDate = normalizeDateInputValue(settings.startDate);
  if (!startDate) {
    throw new Error("Invalid account book start date payload.");
  }

  return {
    ...settings,
    unitUsage,
    startDate: startOfUtcDay(startDate),
  };
}
